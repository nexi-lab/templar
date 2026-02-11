import type { NodeCapabilities } from "@templar/gateway-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthMonitor, type PingSender } from "../health-monitor.js";
import { NodeRegistry } from "../node-registry.js";

const DEFAULT_CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

const HEALTH_INTERVAL = 30_000;

describe("HealthMonitor", () => {
  let registry: NodeRegistry;
  let sendPing: PingSender;
  let monitor: HealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new NodeRegistry();
    sendPing = vi.fn();
    monitor = new HealthMonitor(registry, { healthCheckInterval: HEALTH_INTERVAL }, sendPing);
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("start / stop", () => {
    it("starts the sweep timer", () => {
      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });

    it("stops the sweep timer", () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it("double start is a no-op", () => {
      monitor.start();
      monitor.start(); // should not throw or create duplicate timers
      expect(monitor.isRunning).toBe(true);
    });

    it("stop when not started is a no-op", () => {
      monitor.stop(); // should not throw
      expect(monitor.isRunning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Sweep behavior
  // -------------------------------------------------------------------------

  describe("sweep", () => {
    it("sends ping to all registered nodes on first sweep", () => {
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      monitor.start();

      vi.advanceTimersByTime(HEALTH_INTERVAL);

      expect(sendPing).toHaveBeenCalledTimes(2);
      expect(sendPing).toHaveBeenCalledWith("node-1");
      expect(sendPing).toHaveBeenCalledWith("node-2");
    });

    it("marks nodes as not alive after ping (waiting for pong)", () => {
      registry.register("node-1", DEFAULT_CAPS);
      monitor.start();

      vi.advanceTimersByTime(HEALTH_INTERVAL);

      // After first sweep, node is marked !isAlive (waiting for pong)
      expect(registry.get("node-1")?.isAlive).toBe(false);
    });

    it("node that responds with pong is marked alive", () => {
      registry.register("node-1", DEFAULT_CAPS);
      monitor.start();

      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(registry.get("node-1")?.isAlive).toBe(false);

      // Node responds with pong
      monitor.handlePong("node-1");
      expect(registry.get("node-1")?.isAlive).toBe(true);
    });

    it("node that misses pong is reported as dead on next sweep", () => {
      const deadHandler = vi.fn();
      monitor.onNodeDead(deadHandler);

      registry.register("node-1", DEFAULT_CAPS);
      monitor.start();

      // First sweep: marks !isAlive, sends ping
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(deadHandler).not.toHaveBeenCalled();

      // No pong arrives
      // Second sweep: detects !isAlive → dead
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(deadHandler).toHaveBeenCalledTimes(1);
      expect(deadHandler).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "node-1" }));
    });

    it("node that responds to pong survives second sweep", () => {
      const deadHandler = vi.fn();
      monitor.onNodeDead(deadHandler);

      registry.register("node-1", DEFAULT_CAPS);
      monitor.start();

      // First sweep
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      // Node responds
      monitor.handlePong("node-1");

      // Second sweep — node is alive, so it gets pinged again (not dead)
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(deadHandler).not.toHaveBeenCalled();
      expect(sendPing).toHaveBeenCalledTimes(2); // once per sweep
    });

    it("multiple nodes: one alive, one dead", () => {
      const deadHandler = vi.fn();
      monitor.onNodeDead(deadHandler);

      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      monitor.start();

      // First sweep: both pinged
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      // Only node-1 responds
      monitor.handlePong("node-1");

      // Second sweep: node-2 is dead
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(deadHandler).toHaveBeenCalledTimes(1);
      expect(deadHandler).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "node-2" }));
    });

    it("no nodes: sweep is a no-op", () => {
      monitor.start();
      vi.advanceTimersByTime(HEALTH_INTERVAL);
      expect(sendPing).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handlePong
  // -------------------------------------------------------------------------

  describe("handlePong()", () => {
    it("marks node alive", () => {
      registry.register("node-1", DEFAULT_CAPS);
      registry.markDead("node-1");
      monitor.handlePong("node-1");
      expect(registry.get("node-1")?.isAlive).toBe(true);
    });

    it("pong for unknown node is a no-op", () => {
      expect(() => monitor.handlePong("unknown")).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Dead handlers
  // -------------------------------------------------------------------------

  describe("onNodeDead()", () => {
    it("fires multiple handlers", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      monitor.onNodeDead(h1);
      monitor.onNodeDead(h2);

      registry.register("node-1", DEFAULT_CAPS);
      monitor.start();

      // Two sweeps without pong
      vi.advanceTimersByTime(HEALTH_INTERVAL * 2);

      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });
  });
});
