import { GatewayAgentNotFoundError, GatewayNodeNotFoundError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { BindingResolver } from "../binding-resolver.js";
import { LaneDispatcher } from "../lanes/lane-dispatcher.js";
import type { LaneMessage, NodeCapabilities } from "../protocol/index.js";
import { NodeRegistry } from "../registry/node-registry.js";
import { AgentRouter } from "../router.js";

const DEFAULT_CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

function makeMessage(overrides: Partial<LaneMessage> = {}): LaneMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    lane: "steer",
    channelId: "ch-1",
    payload: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("AgentRouter", () => {
  // -------------------------------------------------------------------------
  // Binding (channel-based, backward compat)
  // -------------------------------------------------------------------------

  describe("bind / unbind", () => {
    it("binds a channel to a node", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      const router = new AgentRouter(registry);

      router.bind("ch-1", "node-1");
      expect(router.getBinding("ch-1")).toBe("node-1");
    });

    it("throws when binding to unknown node", () => {
      const registry = new NodeRegistry();
      const router = new AgentRouter(registry);

      expect(() => router.bind("ch-1", "unknown")).toThrow(GatewayNodeNotFoundError);
    });

    it("unbind removes binding", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      const router = new AgentRouter(registry);

      router.bind("ch-1", "node-1");
      router.unbind("ch-1");
      expect(router.getBinding("ch-1")).toBeUndefined();
    });

    it("unbind unknown channel is a no-op", () => {
      const registry = new NodeRegistry();
      const router = new AgentRouter(registry);
      expect(() => router.unbind("unknown")).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Without bindings (backward compat)
  // -------------------------------------------------------------------------

  describe("without bindings (backward compat)", () => {
    describe("route()", () => {
      it("routes message to bound node's dispatcher", () => {
        const registry = new NodeRegistry();
        registry.register("node-1", DEFAULT_CAPS);

        const dispatcher = new LaneDispatcher(256);
        const router = new AgentRouter(registry);
        router.setDispatcher("node-1", dispatcher);
        router.bind("ch-1", "node-1");

        const msg = makeMessage({ channelId: "ch-1", lane: "steer" });
        router.route(msg);

        expect(dispatcher.queueSize("steer")).toBe(1);
      });

      it("throws for unbound channel", () => {
        const registry = new NodeRegistry();
        const router = new AgentRouter(registry);

        expect(() => router.route(makeMessage({ channelId: "unknown" }))).toThrow(
          GatewayNodeNotFoundError,
        );
      });

      it("throws when dispatcher not registered", () => {
        const registry = new NodeRegistry();
        registry.register("node-1", DEFAULT_CAPS);
        const router = new AgentRouter(registry);
        router.bind("ch-1", "node-1");

        expect(() => router.route(makeMessage({ channelId: "ch-1" }))).toThrow(
          GatewayNodeNotFoundError,
        );
      });

      it("routes different channels to different nodes", () => {
        const registry = new NodeRegistry();
        registry.register("node-1", DEFAULT_CAPS);
        registry.register("node-2", DEFAULT_CAPS);

        const d1 = new LaneDispatcher(256);
        const d2 = new LaneDispatcher(256);
        const router = new AgentRouter(registry);
        router.setDispatcher("node-1", d1);
        router.setDispatcher("node-2", d2);
        router.bind("ch-1", "node-1");
        router.bind("ch-2", "node-2");

        router.route(makeMessage({ channelId: "ch-1" }));
        router.route(makeMessage({ channelId: "ch-2" }));

        expect(d1.totalQueued).toBe(1);
        expect(d2.totalQueued).toBe(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // With bindings (multi-agent routing)
  // -------------------------------------------------------------------------

  describe("with bindings", () => {
    it("routes via binding resolver when configured", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["work"] });

      const router = new AgentRouter(registry);
      const dispatcher = new LaneDispatcher(256);
      router.setDispatcher("node-1", dispatcher);

      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      router.setAgentNodeResolver((agentId) => (agentId === "work" ? "node-1" : undefined));

      router.route(makeMessage({ channelId: "slack" }));
      expect(dispatcher.totalQueued).toBe(1);
    });

    it("throws GatewayAgentNotFoundError when agent has no node", () => {
      const registry = new NodeRegistry();
      const router = new AgentRouter(registry);

      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "orphan", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      router.setAgentNodeResolver(() => undefined);

      expect(() => router.route(makeMessage({ channelId: "slack" }))).toThrow(
        GatewayAgentNotFoundError,
      );
    });

    it("throws GatewayAgentNotFoundError when no agentNodeResolver set", () => {
      const registry = new NodeRegistry();
      const router = new AgentRouter(registry);

      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      // No agentNodeResolver set

      expect(() => router.route(makeMessage({ channelId: "slack" }))).toThrow(
        GatewayAgentNotFoundError,
      );
    });

    it("throws GatewayNodeNotFoundError when nodeId has no dispatcher", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["work"] });
      const router = new AgentRouter(registry);
      // No dispatcher set for node-1

      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      router.setAgentNodeResolver((agentId) => (agentId === "work" ? "node-1" : undefined));

      expect(() => router.route(makeMessage({ channelId: "slack" }))).toThrow(
        GatewayNodeNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mixed mode: bindings + channel fallback
  // -------------------------------------------------------------------------

  describe("mixed mode", () => {
    it("binding match takes precedence over channel binding", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["agent-a"] });
      registry.register("node-2", DEFAULT_CAPS);

      const router = new AgentRouter(registry);
      const d1 = new LaneDispatcher(256);
      const d2 = new LaneDispatcher(256);
      router.setDispatcher("node-1", d1);
      router.setDispatcher("node-2", d2);

      // Channel binding for slack → node-2
      router.bind("slack", "node-2");

      // Agent binding for slack → agent-a → node-1 (should take precedence)
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "agent-a", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      router.setAgentNodeResolver((agentId) => (agentId === "agent-a" ? "node-1" : undefined));

      router.route(makeMessage({ channelId: "slack" }));
      expect(d1.totalQueued).toBe(1);
      expect(d2.totalQueued).toBe(0);
    });

    it("falls through to channel binding when no agent binding matches", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["agent-a"] });
      registry.register("node-2", DEFAULT_CAPS);

      const router = new AgentRouter(registry);
      const d1 = new LaneDispatcher(256);
      const d2 = new LaneDispatcher(256);
      router.setDispatcher("node-1", d1);
      router.setDispatcher("node-2", d2);

      // Agent binding only for slack
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "agent-a", match: { channel: "slack" } }]);
      router.setBindingResolver(resolver);
      router.setAgentNodeResolver((agentId) => (agentId === "agent-a" ? "node-1" : undefined));

      // Channel binding for discord
      router.bind("discord", "node-2");

      // discord should fall through to channel binding
      router.route(makeMessage({ channelId: "discord" }));
      expect(d2.totalQueued).toBe(1);
      expect(d1.totalQueued).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Dispatcher management
  // -------------------------------------------------------------------------

  describe("removeDispatcher()", () => {
    it("removes dispatcher and cleans up bindings", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      registry.register("node-2", DEFAULT_CAPS);

      const router = new AgentRouter(registry);
      router.setDispatcher("node-1", new LaneDispatcher(256));
      router.setDispatcher("node-2", new LaneDispatcher(256));
      router.bind("ch-1", "node-1");
      router.bind("ch-2", "node-2");

      router.removeDispatcher("node-1");

      expect(router.getBinding("ch-1")).toBeUndefined(); // cleaned up
      expect(router.getBinding("ch-2")).toBe("node-2"); // preserved
    });
  });

  // -------------------------------------------------------------------------
  // getAllBindings
  // -------------------------------------------------------------------------

  describe("getAllBindings()", () => {
    it("returns all current bindings", () => {
      const registry = new NodeRegistry();
      registry.register("node-1", DEFAULT_CAPS);
      const router = new AgentRouter(registry);
      router.bind("ch-1", "node-1");
      router.bind("ch-2", "node-1");

      const bindings = router.getAllBindings();
      expect(bindings.size).toBe(2);
    });
  });
});
