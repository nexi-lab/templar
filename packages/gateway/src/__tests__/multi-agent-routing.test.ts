import { GatewayAgentNotFoundError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { BindingResolver } from "../binding-resolver.js";
import type { AgentBinding } from "../protocol/bindings.js";
import type { NodeCapabilities } from "../protocol/index.js";
import { MessageBuffer } from "../queue/message-buffer.js";
import { NodeRegistry } from "../registry/node-registry.js";
import { AgentRouter } from "../router.js";
import { createTestGateway, DEFAULT_CAPS, makeMessage, sendFrame } from "./helpers.js";

function setupRouterWithBindings(
  bindings: AgentBinding[],
  nodes: Array<{ nodeId: string; agentIds: string[]; caps?: NodeCapabilities }>,
): { router: AgentRouter; dispatchers: Map<string, MessageBuffer> } {
  const registry = new NodeRegistry();
  const dispatchers = new Map<string, MessageBuffer>();
  const router = new AgentRouter(registry);

  // Build agentToNode map
  const agentToNode = new Map<string, string>();

  for (const node of nodes) {
    const caps: NodeCapabilities = node.caps ?? {
      ...DEFAULT_CAPS,
      agentIds: node.agentIds,
    };
    registry.register(node.nodeId, caps);
    const dispatcher = new MessageBuffer(256);
    router.setDispatcher(node.nodeId, dispatcher);
    dispatchers.set(node.nodeId, dispatcher);

    for (const agentId of node.agentIds) {
      agentToNode.set(agentId, node.nodeId);
    }
  }

  // Set up binding resolver
  const resolver = new BindingResolver();
  resolver.updateBindings(bindings);
  router.setBindingResolver(resolver);
  router.setAgentNodeResolver((agentId) => agentToNode.get(agentId));

  return { router, dispatchers };
}

// ---------------------------------------------------------------------------
// Multi-agent routing scenarios
// ---------------------------------------------------------------------------

describe("Multi-agent routing", () => {
  // -----------------------------------------------------------------------
  // Scenario 1: Two agents on two different nodes
  // -----------------------------------------------------------------------

  it("routes messages to correct agents on different nodes", () => {
    const { router, dispatchers } = setupRouterWithBindings(
      [
        { agentId: "work-agent", match: { channel: "slack" } },
        { agentId: "personal-agent", match: { channel: "whatsapp" } },
      ],
      [
        { nodeId: "node-1", agentIds: ["work-agent"] },
        { nodeId: "node-2", agentIds: ["personal-agent"] },
      ],
    );

    router.route(makeMessage({ channelId: "slack" }));
    router.route(makeMessage({ channelId: "whatsapp" }));

    expect(dispatchers.get("node-1")?.totalQueued).toBe(1);
    expect(dispatchers.get("node-2")?.totalQueued).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Two agents on the same node
  // -----------------------------------------------------------------------

  it("routes different agents on the same node", () => {
    const { router, dispatchers } = setupRouterWithBindings(
      [
        { agentId: "agent-a", match: { channel: "slack" } },
        { agentId: "agent-b", match: { channel: "discord" } },
      ],
      [{ nodeId: "node-1", agentIds: ["agent-a", "agent-b"] }],
    );

    router.route(makeMessage({ channelId: "slack" }));
    router.route(makeMessage({ channelId: "discord" }));

    // Both messages go to the same node
    expect(dispatchers.get("node-1")?.totalQueued).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Hot-reload binding change
  // -----------------------------------------------------------------------

  it("updates routing after hot-reload binding change", () => {
    const registry = new NodeRegistry();
    const router = new AgentRouter(registry);
    const agentToNode = new Map<string, string>();

    // Set up nodes
    registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["agent-a"] });
    registry.register("node-2", { ...DEFAULT_CAPS, agentIds: ["agent-b"] });
    agentToNode.set("agent-a", "node-1");
    agentToNode.set("agent-b", "node-2");

    const d1 = new MessageBuffer(256);
    const d2 = new MessageBuffer(256);
    router.setDispatcher("node-1", d1);
    router.setDispatcher("node-2", d2);

    const resolver = new BindingResolver();
    resolver.updateBindings([{ agentId: "agent-a", match: { channel: "slack" } }]);
    router.setBindingResolver(resolver);
    router.setAgentNodeResolver((agentId) => agentToNode.get(agentId));

    // Initially routes to node-1
    router.route(makeMessage({ channelId: "slack" }));
    expect(d1.totalQueued).toBe(1);

    // Hot-reload: change slack binding to agent-b
    resolver.updateBindings([{ agentId: "agent-b", match: { channel: "slack" } }]);

    router.route(makeMessage({ channelId: "slack" }));
    expect(d2.totalQueued).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Node deregistration cleans up agentId mapping
  // -----------------------------------------------------------------------

  it("cleans up agentId mapping on node deregistration", async () => {
    const { gateway, wss } = createTestGateway({
      bindings: [{ agentId: "work", match: { channel: "slack" } }],
    });
    await gateway.start();

    // Register a node with agentIds
    const ws = wss.connect();
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "node-1",
      capabilities: { ...DEFAULT_CAPS, agentIds: ["work"] },
      token: "test-key",
    });

    // Verify agentToNode mapping exists
    expect(gateway.getAgentToNodeMap().get("work")).toBe("node-1");

    // Deregister the node
    sendFrame(ws, {
      kind: "node.deregister",
      nodeId: "node-1",
    });

    // agentToNode mapping should be cleaned up
    expect(gateway.getAgentToNodeMap().get("work")).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Fallback — no bindings, existing bindChannel() works
  // -----------------------------------------------------------------------

  it("falls back to channel binding when no agent bindings configured", () => {
    const registry = new NodeRegistry();
    registry.register("node-1", DEFAULT_CAPS);

    const router = new AgentRouter(registry);
    const dispatcher = new MessageBuffer(256);
    router.setDispatcher("node-1", dispatcher);
    router.bind("ch-1", "node-1");

    // No binding resolver set — uses channel binding directly
    router.route(makeMessage({ channelId: "ch-1" }));
    expect(dispatcher.totalQueued).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Error — agent resolved but no node serves it
  // -----------------------------------------------------------------------

  it("throws GatewayAgentNotFoundError when no node serves agent", () => {
    const registry = new NodeRegistry();
    const router = new AgentRouter(registry);

    const resolver = new BindingResolver();
    resolver.updateBindings([{ agentId: "orphan-agent", match: { channel: "slack" } }]);
    router.setBindingResolver(resolver);
    // agentNodeResolver returns undefined for unknown agents
    router.setAgentNodeResolver(() => undefined);

    expect(() => router.route(makeMessage({ channelId: "slack" }))).toThrow(
      GatewayAgentNotFoundError,
    );
  });

  // -----------------------------------------------------------------------
  // Mixed mode: bindings + channel fallback
  // -----------------------------------------------------------------------

  it("falls through to channel binding when no agent binding matches", () => {
    const registry = new NodeRegistry();
    registry.register("node-1", { ...DEFAULT_CAPS, agentIds: ["work"] });
    registry.register("node-2", DEFAULT_CAPS);

    const router = new AgentRouter(registry);
    const d1 = new MessageBuffer(256);
    const d2 = new MessageBuffer(256);
    router.setDispatcher("node-1", d1);
    router.setDispatcher("node-2", d2);

    // Agent binding only for slack
    const resolver = new BindingResolver();
    resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);
    router.setBindingResolver(resolver);
    router.setAgentNodeResolver((agentId) => (agentId === "work" ? "node-1" : undefined));

    // Channel binding for discord → node-2
    router.bind("discord", "node-2");

    // slack routes via agent binding
    router.route(makeMessage({ channelId: "slack" }));
    expect(d1.totalQueued).toBe(1);

    // discord falls through to channel binding
    router.route(makeMessage({ channelId: "discord" }));
    expect(d2.totalQueued).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Gateway integration: node registration with agentIds
  // -----------------------------------------------------------------------

  it("registers agentIds from node capabilities in gateway", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect();
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "node-1",
      capabilities: {
        ...DEFAULT_CAPS,
        agentIds: ["agent-a", "agent-b"],
      },
      token: "test-key",
    });

    const map = gateway.getAgentToNodeMap();
    expect(map.get("agent-a")).toBe("node-1");
    expect(map.get("agent-b")).toBe("node-1");
  });
});
