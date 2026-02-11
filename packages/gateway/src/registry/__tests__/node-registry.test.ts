import { GatewayNodeAlreadyRegisteredError, GatewayNodeNotFoundError } from "@templar/errors";
import type { NodeCapabilities, TaskRequirements } from "@templar/gateway-protocol";
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "../node-registry.js";

const DEFAULT_CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: ["web-search", "calculator"],
  maxConcurrency: 4,
  channels: ["slack", "discord"],
};

describe("NodeRegistry", () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe("register()", () => {
    it("registers a node", () => {
      const registry = new NodeRegistry();
      const node = registry.register("node-1", DEFAULT_CAPS);
      expect(node.nodeId).toBe("node-1");
      expect(node.capabilities).toEqual(DEFAULT_CAPS);
      expect(node.isAlive).toBe(true);
    });

    it("throws on duplicate registration", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      expect(() => registry.register("node-1", DEFAULT_CAPS)).toThrow(
        GatewayNodeAlreadyRegisteredError,
      );
    });

    it("allows registering different nodes", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      expect(registry.size).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Deregistration
  // -------------------------------------------------------------------------

  describe("deregister()", () => {
    it("removes a registered node", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.deregister("node-1");
      expect(registry.get("node-1")).toBeUndefined();
      expect(registry.size).toBe(0);
    });

    it("throws for unknown node", () => {
      const registry = new NodeRegistry();
      expect(() => registry.deregister("unknown")).toThrow(GatewayNodeNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------

  describe("get()", () => {
    it("returns registered node", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      expect(registry.get("node-1")?.nodeId).toBe("node-1");
    });

    it("returns undefined for unknown node", () => {
      const registry = new NodeRegistry();
      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  describe("all()", () => {
    it("returns all registered nodes", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      expect(registry.all()).toHaveLength(2);
    });

    it("returns empty when no nodes", () => {
      const registry = new NodeRegistry();
      expect(registry.all()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Capability-based lookup
  // -------------------------------------------------------------------------

  describe("findByRequirements()", () => {
    it("finds nodes matching agent type", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, agentTypes: ["high"] });
      registry.register("node-2", { ...DEFAULT_CAPS, agentTypes: ["dark"] });

      const results = registry.findByRequirements({ agentType: "high" });
      expect(results).toHaveLength(1);
      expect(results[0]?.nodeId).toBe("node-1");
    });

    it("finds nodes matching tools", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, tools: ["web-search"] });
      registry.register("node-2", { ...DEFAULT_CAPS, tools: ["calculator"] });

      const req: TaskRequirements = { agentType: "high", tools: ["web-search"] };
      const results = registry.findByRequirements(req);
      expect(results).toHaveLength(1);
      expect(results[0]?.nodeId).toBe("node-1");
    });

    it("finds nodes matching channel", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, channels: ["slack"] });
      registry.register("node-2", { ...DEFAULT_CAPS, channels: ["discord"] });

      const req: TaskRequirements = { agentType: "high", channel: "slack" };
      const results = registry.findByRequirements(req);
      expect(results).toHaveLength(1);
      expect(results[0]?.nodeId).toBe("node-1");
    });

    it("excludes dead nodes", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.markDead("node-1");

      const results = registry.findByRequirements({ agentType: "high" });
      expect(results).toHaveLength(0);
    });

    it("returns empty when no nodes match", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);

      const results = registry.findByRequirements({ agentType: "nonexistent" });
      expect(results).toHaveLength(0);
    });

    it("matches all tool requirements (AND semantics)", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, tools: ["a", "b", "c"] });
      registry.register("node-2", { ...DEFAULT_CAPS, tools: ["a", "b"] });

      const req: TaskRequirements = { agentType: "high", tools: ["a", "b", "c"] };
      const results = registry.findByRequirements(req);
      expect(results).toHaveLength(1);
      expect(results[0]?.nodeId).toBe("node-1");
    });
  });

  // -------------------------------------------------------------------------
  // Health tracking
  // -------------------------------------------------------------------------

  describe("markAlive / markDead", () => {
    it("markDead sets isAlive to false", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.markDead("node-1");
      expect(registry.get("node-1")?.isAlive).toBe(false);
    });

    it("markAlive sets isAlive to true and updates lastPong", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.markDead("node-1");
      registry.markAlive("node-1");
      const node = registry.get("node-1");
      expect(node?.isAlive).toBe(true);
    });

    it("markAlive on unknown node is no-op", () => {
      const registry = new NodeRegistry();
      expect(() => registry.markAlive("unknown")).not.toThrow();
    });

    it("markDead on unknown node is no-op", () => {
      const registry = new NodeRegistry();
      expect(() => registry.markDead("unknown")).not.toThrow();
    });
  });

  describe("getAliveNodes()", () => {
    it("returns only alive nodes", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      registry.markDead("node-2");

      const alive = registry.getAliveNodes();
      expect(alive).toHaveLength(1);
      expect(alive[0]?.nodeId).toBe("node-1");
    });
  });

  // -------------------------------------------------------------------------
  // Clear
  // -------------------------------------------------------------------------

  describe("clear()", () => {
    it("removes all nodes", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });
});
