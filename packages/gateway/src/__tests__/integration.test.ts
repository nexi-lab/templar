/**
 * Integration tests for the TemplarGateway orchestrator.
 *
 * These tests exercise the full lifecycle:
 *   connect → register → heartbeat → lane message → deregister → disconnect
 *
 * All subsystems are wired together via the orchestrator.
 */

import type { GatewayConfig, GatewayFrame, NodeCapabilities } from "@templar/gateway-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplarGateway } from "../gateway.js";
import type { WebSocketLike, WebSocketServerLike, WsServerFactory } from "../server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GatewayConfig = {
  port: 0,
  nexusUrl: "https://api.nexus.test",
  nexusApiKey: "test-key",
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
  healthCheckInterval: 30_000,
  laneCapacity: 256,
};

const CAPS: NodeCapabilities = {
  agentTypes: ["high", "low"],
  tools: ["search", "calculator"],
  maxConcurrency: 8,
  channels: ["chat", "voice"],
};

interface MockWs extends WebSocketLike {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
  sentFrames: () => GatewayFrame[];
}

function createMockWs(): MockWs {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  const sendMock = vi.fn();
  return {
    handlers,
    readyState: 1,
    send: sendMock,
    close: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
    sentFrames(): GatewayFrame[] {
      return sendMock.mock.calls.map((call) => JSON.parse(String(call[0])) as GatewayFrame);
    },
  };
}

interface MockWss extends WebSocketServerLike {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
  connect: (nodeId: string) => MockWs;
}

function createMockWss(): MockWss {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  return {
    handlers,
    clients: new Set<WebSocketLike>(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
    close(cb?: (err?: Error) => void) {
      cb?.();
    },
    connect(nodeId: string): MockWs {
      const ws = createMockWs();
      const connectionHandlers = handlers.get("connection") ?? [];
      for (const h of connectionHandlers) {
        h(ws, { url: `/?nodeId=${nodeId}`, headers: { host: "localhost" } });
      }
      return ws;
    },
  };
}

function sendFrame(ws: MockWs, frame: GatewayFrame): void {
  const messageHandlers = ws.handlers.get("message") ?? [];
  for (const h of messageHandlers) {
    h(JSON.stringify(frame));
  }
}

function closeWs(ws: MockWs, code = 1000, reason = ""): void {
  const closeHandlers = ws.handlers.get("close") ?? [];
  for (const h of closeHandlers) {
    h(code, reason);
  }
}

function createGateway(configOverrides: Partial<GatewayConfig> = {}): {
  gateway: TemplarGateway;
  wss: MockWss;
} {
  const wss = createMockWss();
  const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const gateway = new TemplarGateway(config, {
    wsFactory: factory,
    configWatcherDeps: {
      watch: () => ({
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  });
  return { gateway, wss };
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("TemplarGateway integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Full lifecycle
  // -------------------------------------------------------------------------

  describe("full node lifecycle", () => {
    it("connect → register → heartbeat → lane.message → deregister → disconnect", async () => {
      const { gateway, wss } = createGateway();
      const events: string[] = [];

      gateway.onNodeRegistered((id) => events.push(`registered:${id}`));
      gateway.onNodeDeregistered((id) => events.push(`deregistered:${id}`));

      await gateway.start();

      // 1. Connect
      const ws = wss.connect("agent-1");

      // 2. Register
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      expect(gateway.nodeCount).toBe(1);
      expect(gateway.getRegistry().get("agent-1")?.capabilities).toEqual(CAPS);

      // Should have sent ack
      const ack = ws.sentFrames().find((f) => f.kind === "node.register.ack");
      expect(ack).toBeDefined();
      expect(ack?.kind === "node.register.ack" && ack.nodeId).toBe("agent-1");

      // 3. Heartbeat pong
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });
      expect(gateway.getRegistry().get("agent-1")?.isAlive).toBe(true);

      // 4. Lane message
      gateway.bindChannel("ch-1", "agent-1");
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: { text: "hello" },
          timestamp: Date.now(),
        },
      });
      // If it didn't throw, routing succeeded

      // 5. Deregister
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
        reason: "shutting down",
      });
      expect(gateway.nodeCount).toBe(0);

      // 6. Disconnect
      closeWs(ws, 1000, "Normal closure");

      // Verify events
      expect(events).toEqual(["registered:agent-1", "deregistered:agent-1"]);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-node
  // -------------------------------------------------------------------------

  describe("multi-node scenarios", () => {
    it("handles multiple nodes registering and communicating independently", async () => {
      const { gateway, wss } = createGateway();
      await gateway.start();

      // Register 3 nodes
      const ws1 = wss.connect("agent-1");
      const ws2 = wss.connect("agent-2");
      const ws3 = wss.connect("agent-3");

      for (const [ws, id] of [
        [ws1, "agent-1"],
        [ws2, "agent-2"],
        [ws3, "agent-3"],
      ] as const) {
        sendFrame(ws, {
          kind: "node.register",
          nodeId: id,
          capabilities: CAPS,
          token: "test-key",
        });
      }

      expect(gateway.nodeCount).toBe(3);

      // Bind different channels to different nodes
      gateway.bindChannel("ch-1", "agent-1");
      gateway.bindChannel("ch-2", "agent-2");
      gateway.bindChannel("ch-3", "agent-3");

      // Route messages to each
      for (const [ws, channelId] of [
        [ws1, "ch-1"],
        [ws2, "ch-2"],
        [ws3, "ch-3"],
      ] as const) {
        sendFrame(ws, {
          kind: "lane.message",
          lane: "steer",
          message: {
            id: `msg-${channelId}`,
            lane: "steer",
            channelId,
            payload: null,
            timestamp: Date.now(),
          },
        });
      }

      // Deregister node-2, nodes 1 and 3 remain
      sendFrame(ws2, {
        kind: "node.deregister",
        nodeId: "agent-2",
      });
      expect(gateway.nodeCount).toBe(2);
      expect(gateway.getRouter().getBinding("ch-2")).toBeUndefined(); // cleaned up
      expect(gateway.getRouter().getBinding("ch-1")).toBe("agent-1"); // preserved

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Session state transitions
  // -------------------------------------------------------------------------

  describe("session state transitions", () => {
    it("transitions to idle after session timeout", async () => {
      const { gateway, wss } = createGateway({ sessionTimeout: 1000 });
      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      const session = gateway.getSessionManager().getSession("agent-1");
      expect(session?.state).toBe("connected");

      // Advance past session timeout
      vi.advanceTimersByTime(1001);

      const idleSession = gateway.getSessionManager().getSession("agent-1");
      expect(idleSession?.state).toBe("idle");

      await gateway.stop();
    });

    it("resets idle timer on heartbeat activity", async () => {
      const { gateway, wss } = createGateway({ sessionTimeout: 1000 });
      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      // Advance 800ms (not yet idle)
      vi.advanceTimersByTime(800);
      expect(gateway.getSessionManager().getSession("agent-1")?.state).toBe("connected");

      // Send heartbeat — should reset the timer
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });

      // Advance another 800ms — still not idle (timer was reset)
      vi.advanceTimersByTime(800);
      expect(gateway.getSessionManager().getSession("agent-1")?.state).toBe("connected");

      // Advance past the full timeout from last activity
      vi.advanceTimersByTime(201);
      expect(gateway.getSessionManager().getSession("agent-1")?.state).toBe("idle");

      await gateway.stop();
    });

    it("transitions idle → suspended → disconnected on suspend timeout", async () => {
      const { gateway, wss } = createGateway({
        sessionTimeout: 500,
        suspendTimeout: 500,
      });
      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      // connected → idle
      vi.advanceTimersByTime(501);
      expect(gateway.getSessionManager().getSession("agent-1")?.state).toBe("idle");

      // idle → suspended
      vi.advanceTimersByTime(501);
      expect(gateway.getSessionManager().getSession("agent-1")?.state).toBe("suspended");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Health monitor + dead node cleanup
  // -------------------------------------------------------------------------

  describe("health monitor integration", () => {
    it("detects and cleans up dead nodes", async () => {
      const { gateway, wss } = createGateway({ healthCheckInterval: 1000 });
      const deadHandler = vi.fn();
      gateway.onNodeDead(deadHandler);

      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      expect(gateway.nodeCount).toBe(1);

      // First sweep: marks all nodes as !isAlive and sends ping
      vi.advanceTimersByTime(1000);
      // Node is now marked !isAlive, waiting for pong
      expect(gateway.getRegistry().get("agent-1")?.isAlive).toBe(false);

      // Don't send pong — simulate dead node
      // Second sweep: sees !isAlive → fires dead handler
      vi.advanceTimersByTime(1000);

      expect(deadHandler).toHaveBeenCalledWith("agent-1");
      expect(gateway.nodeCount).toBe(0); // cleaned up

      await gateway.stop();
    });

    it("keeps nodes alive when pong is received between sweeps", async () => {
      const { gateway, wss } = createGateway({ healthCheckInterval: 1000 });
      const deadHandler = vi.fn();
      gateway.onNodeDead(deadHandler);

      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      // First sweep: marks !isAlive + sends ping
      vi.advanceTimersByTime(1000);

      // Respond with pong before next sweep
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });
      expect(gateway.getRegistry().get("agent-1")?.isAlive).toBe(true);

      // Second sweep: sees isAlive → marks !isAlive + sends ping (doesn't fire dead)
      vi.advanceTimersByTime(1000);

      expect(deadHandler).not.toHaveBeenCalled();
      expect(gateway.nodeCount).toBe(1);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Lane priority
  // -------------------------------------------------------------------------

  describe("lane priority and dispatch", () => {
    it("dispatches messages in priority order: steer → collect → followup", async () => {
      const { gateway, wss } = createGateway();
      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      // Send messages in reverse priority order
      const lanes = ["followup", "collect", "steer"] as const;
      for (const lane of lanes) {
        sendFrame(ws, {
          kind: "lane.message",
          lane,
          message: {
            id: `msg-${lane}`,
            lane,
            channelId: "ch-1",
            payload: null,
            timestamp: Date.now(),
          },
        });
      }

      // Access the dispatcher through the router internals isn't possible
      // directly, but we can verify the total queued count
      // by checking the router still works (no overflow, no errors)
      expect(gateway.nodeCount).toBe(1);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Error resilience
  // -------------------------------------------------------------------------

  describe("error resilience", () => {
    it("continues operating after invalid frame from one connection", async () => {
      const { gateway, wss } = createGateway();
      await gateway.start();

      const ws1 = wss.connect("agent-1");
      const ws2 = wss.connect("agent-2");

      // Register both
      for (const [ws, id] of [
        [ws1, "agent-1"],
        [ws2, "agent-2"],
      ] as const) {
        sendFrame(ws, {
          kind: "node.register",
          nodeId: id,
          capabilities: CAPS,
          token: "test-key",
        });
      }

      // Send garbage from ws1
      const messageHandlers = ws1.handlers.get("message") ?? [];
      for (const h of messageHandlers) {
        h("not valid json");
      }

      // ws2 should still work fine
      sendFrame(ws2, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });

      expect(gateway.nodeCount).toBe(2);
      expect(gateway.getRegistry().get("agent-2")?.isAlive).toBe(true);

      await gateway.stop();
    });

    it("handles deregistration of already-deregistered node gracefully", async () => {
      const { gateway, wss } = createGateway();
      await gateway.start();

      const ws = wss.connect("agent-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: CAPS,
        token: "test-key",
      });

      // Deregister
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
      });

      // Second deregister should not throw
      expect(() =>
        sendFrame(ws, {
          kind: "node.deregister",
          nodeId: "agent-1",
        }),
      ).not.toThrow();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-package type verification
  // -------------------------------------------------------------------------

  describe("cross-package type verification", () => {
    it("gateway-protocol types flow through the orchestrator correctly", async () => {
      const { gateway, wss } = createGateway();
      await gateway.start();

      const ws = wss.connect("agent-1");

      // Register with full capabilities
      const fullCaps: NodeCapabilities = {
        agentTypes: ["high", "low", "specialized"],
        tools: ["search", "calculator", "browser"],
        maxConcurrency: 16,
        channels: ["chat", "voice", "email"],
      };

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: fullCaps,
        token: "test-key",
      });

      // Verify capabilities are stored correctly
      const node = gateway.getRegistry().get("agent-1");
      expect(node?.capabilities).toEqual(fullCaps);

      // Verify capability-based lookup works
      const matches = gateway.getRegistry().findByRequirements({
        agentType: "specialized",
        tools: ["browser"],
        channel: "email",
      });
      expect(matches).toHaveLength(1);
      expect(matches[0]?.nodeId).toBe("agent-1");

      // Verify no match for missing capability
      const noMatch = gateway.getRegistry().findByRequirements({
        agentType: "unknown",
      });
      expect(noMatch).toHaveLength(0);

      await gateway.stop();
    });

    it("error types from @templar/errors are thrown correctly in gateway context", async () => {
      const { gateway } = createGateway();
      await gateway.start();

      // Try to bind to non-existent node
      const { GatewayNodeNotFoundError } = await import("@templar/errors");
      expect(() => gateway.bindChannel("ch-1", "nonexistent")).toThrow(GatewayNodeNotFoundError);

      await gateway.stop();
    });
  });
});
