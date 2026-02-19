import { describe, expect, it, vi } from "vitest";
import type { ConversationScope, GatewayFrame } from "../protocol/index.js";
import { closeWs, createTestGateway, DEFAULT_CAPS, makeMessage, sendFrame } from "./helpers.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplarGateway", () => {
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("starts and stops cleanly", async () => {
      const { gateway } = createTestGateway();
      await gateway.start();
      await gateway.stop();
    });

    it("exposes config", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getConfig().port).toBe(0);
      expect(gateway.getConfig().nexusApiKey).toBe("test-key");
    });

    it("reports zero connections and nodes initially", async () => {
      const { gateway } = createTestGateway();
      await gateway.start();
      expect(gateway.connectionCount).toBe(0);
      expect(gateway.nodeCount).toBe(0);
      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Node registration
  // -------------------------------------------------------------------------

  describe("node registration", () => {
    it("registers a node via frame and sends ack", async () => {
      const { gateway, wss } = createTestGateway();
      const registeredHandler = vi.fn();
      gateway.onNodeRegistered(registeredHandler);

      await gateway.start();
      const ws = wss.connect("ws-1");

      const registerFrame: GatewayFrame = {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      };
      sendFrame(ws, registerFrame);

      // Should send ack
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"kind":"node.register.ack"'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"nodeId":"agent-1"'));

      // Should register node
      expect(gateway.nodeCount).toBe(1);
      expect(gateway.getRegistry().get("agent-1")).toBeDefined();

      // Should fire handler
      expect(registeredHandler).toHaveBeenCalledWith("agent-1");

      // Should create session
      expect(gateway.getSessionManager().getSession("agent-1")).toBeDefined();

      await gateway.stop();
    });

    it("sends error frame for duplicate registration", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      const registerFrame: GatewayFrame = {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      };

      // First registration
      sendFrame(ws, registerFrame);
      // Second (duplicate)
      sendFrame(ws, registerFrame);

      // Second call should result in error frame
      const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = String(calls[calls.length - 1]);
      expect(lastCall).toContain('"kind":"error"');
      expect(lastCall).toContain("Registration failed");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Node deregistration
  // -------------------------------------------------------------------------

  describe("node deregistration", () => {
    it("deregisters a node via frame", async () => {
      const { gateway, wss } = createTestGateway();
      const deregisteredHandler = vi.fn();
      gateway.onNodeDeregistered(deregisteredHandler);

      await gateway.start();
      const ws = wss.connect("ws-1");

      // Register first
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Deregister
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
        reason: "shutting down",
      });

      expect(gateway.nodeCount).toBe(0);
      expect(deregisteredHandler).toHaveBeenCalledWith("agent-1");
      expect(gateway.getSessionManager().getSession("agent-1")).toBeUndefined();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  describe("heartbeat", () => {
    it("processes pong frames", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      // Register
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Send pong
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });

      // Node should still be alive
      const node = gateway.getRegistry().get("agent-1");
      expect(node?.isAlive).toBe(true);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Lane message routing
  // -------------------------------------------------------------------------

  describe("lane message routing", () => {
    it("routes lane messages and sends ack", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      // Register
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Bind channel to node
      gateway.bindChannel("ch-1", "agent-1");

      // Send lane message
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

      // Should have sent lane.message.ack
      const ackFrame = ws.sentFrames().find((f) => f.kind === "lane.message.ack");
      expect(ackFrame).toBeDefined();
      expect(ackFrame?.kind === "lane.message.ack" && ackFrame.messageId).toBe("msg-1");

      expect(gateway.nodeCount).toBe(1);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // WebSocket disconnect
  // -------------------------------------------------------------------------

  describe("disconnect handling", () => {
    it("handles WebSocket disconnect for registered node", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("agent-1");

      // Register using the WS nodeId
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(gateway.getSessionManager().getSession("agent-1")).toBeDefined();

      // Simulate disconnect
      closeWs(ws, 1000, "Normal closure");

      // Session should have transitioned to disconnected and been cleaned up
      expect(gateway.getSessionManager().getSession("agent-1")).toBeUndefined();

      await gateway.stop();
    });

    it("does not throw for disconnect of unregistered connection", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("unknown-1");

      // Disconnect without prior registration
      expect(() => closeWs(ws, 1000, "Normal")).not.toThrow();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Channel binding
  // -------------------------------------------------------------------------

  describe("channel binding", () => {
    it("binds and unbinds channels", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");
      expect(gateway.getRouter().getBinding("ch-1")).toBe("agent-1");

      gateway.unbindChannel("ch-1");
      expect(gateway.getRouter().getBinding("ch-1")).toBeUndefined();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Subsystem accessors
  // -------------------------------------------------------------------------

  describe("subsystem accessors", () => {
    it("exposes registry, session manager, router, delivery tracker, and conversation store", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getRegistry()).toBeDefined();
      expect(gateway.getSessionManager()).toBeDefined();
      expect(gateway.getRouter()).toBeDefined();
      expect(gateway.getDeliveryTracker()).toBeDefined();
      expect(gateway.getConversationStore()).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Conversation scoping
  // -------------------------------------------------------------------------

  describe("conversation scoping", () => {
    it("creates conversation binding when routing with scope", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      // Register node
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Bind channel
      gateway.bindChannel("ch-1", "agent-1");

      // Route with scope
      const router = gateway.getRouter();
      const result = router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: { text: "hello" },
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(result.key).toBe("agent:bot-1:ch-1:dm:peer-1");
      expect(result.degraded).toBe(false);

      // Verify conversation store has the binding
      const store = gateway.getConversationStore();
      const binding = store.get(result.key);
      expect(binding).toBeDefined();
      expect(binding?.nodeId).toBe("agent-1");

      await gateway.stop();
    });

    it("same peer on two channels with per-channel-peer → separate conversations", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("whatsapp", "agent-1");
      gateway.bindChannel("telegram", "agent-1");

      const router = gateway.getRouter();
      const msg = (channelId: string) => ({
        id: `msg-${channelId}`,
        lane: "steer" as const,
        channelId,
        payload: {},
        timestamp: Date.now(),
        routingContext: { peerId: "peer-1", messageType: "dm" as const },
      });

      const r1 = router.routeWithScope(msg("whatsapp"), "bot-1");
      const r2 = router.routeWithScope(msg("telegram"), "bot-1");

      expect(r1.key).not.toBe(r2.key);
      expect(r1.key).toContain("whatsapp");
      expect(r2.key).toContain("telegram");

      await gateway.stop();
    });

    it("same peer on two channels with per-peer → shared conversation", async () => {
      const { gateway, wss } = createTestGateway({
        defaultConversationScope: "per-peer",
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("whatsapp", "agent-1");
      gateway.bindChannel("telegram", "agent-1");

      const router = gateway.getRouter();
      const msg = (channelId: string) => ({
        id: `msg-${channelId}`,
        lane: "steer" as const,
        channelId,
        payload: {},
        timestamp: Date.now(),
        routingContext: { peerId: "peer-1", messageType: "dm" as const },
      });

      const r1 = router.routeWithScope(msg("whatsapp"), "bot-1");
      const r2 = router.routeWithScope(msg("telegram"), "bot-1");

      expect(r1.key).toBe(r2.key);
      expect(r1.key).toBe("agent:bot-1:dm:peer-1");

      await gateway.stop();
    });

    it("group message ignores DM scope", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("slack", "agent-1");

      const router = gateway.getRouter();
      const result = router.routeWithScope(
        {
          id: "msg-grp",
          lane: "steer",
          channelId: "slack",
          payload: {},
          timestamp: Date.now(),
          routingContext: { groupId: "grp-42", messageType: "group" },
        },
        "bot-1",
      );

      expect(result.key).toBe("agent:bot-1:slack:group:grp-42");

      await gateway.stop();
    });

    it("agent-level scope override", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      const router = gateway.getRouter();
      router.setAgentScope("bot-special", "main");

      const result = router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-special",
      );

      expect(result.key).toBe("agent:bot-special:main");

      await gateway.stop();
    });

    it("missing peerId throws instead of silently degrading", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      const router = gateway.getRouter();

      // per-channel-peer with no peerId now throws to prevent conversation merging
      expect(() =>
        router.routeWithScope(
          {
            id: "msg-1",
            lane: "steer",
            channelId: "ch-1",
            payload: {},
            timestamp: Date.now(),
            // No routingContext — peerId will be undefined
          },
          "bot-1",
        ),
      ).toThrow("peerId");

      await gateway.stop();
    });

    it("cleanupNode removes conversation bindings via reverse index", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      const router = gateway.getRouter();
      router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(gateway.getConversationStore().size).toBe(1);

      // Deregister the node
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
        reason: "shutting down",
      });

      expect(gateway.getConversationStore().size).toBe(0);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Error paths (#10A)
  // -------------------------------------------------------------------------

  describe("error paths", () => {
    it("rejects lane message from unregistered connection", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();

      const ws = wss.connect("unregistered-1");

      // Send a lane message without registering first
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: makeMessage({ channelId: "ch-1" }),
      });

      const frames = ws.sentFrames();
      const errorFrame = frames.find((f) => f.kind === "error");
      expect(errorFrame).toBeDefined();
      expect((errorFrame as { error: { status: number } }).error.status).toBe(403);

      await gateway.stop();
    });

    it("rejects cross-node deregistration attempt", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();

      // Register node-1 on ws1
      const ws1 = wss.connect("ws-1");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Try to deregister node-1 from ws2 (different connection)
      const ws2 = wss.connect("ws-2");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "node-2",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      sendFrame(ws2, {
        kind: "node.deregister",
        nodeId: "node-1",
      });

      const frames = ws2.sentFrames();
      const errorFrame = frames.find((f) => f.kind === "error");
      expect(errorFrame).toBeDefined();
      expect((errorFrame as { error: { status: number } }).error.status).toBe(403);

      // node-1 should still be registered
      expect(gateway.getRegistry().get("node-1")).toBeDefined();

      await gateway.stop();
    });

    it("sends error on lane message routing failure", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();

      const ws = wss.connect("ws-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Route to a channel that has no binding → should fail
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: makeMessage({ channelId: "unbound-channel" }),
      });

      const frames = ws.sentFrames();
      const errorFrame = frames.find((f) => f.kind === "error");
      expect(errorFrame).toBeDefined();
      expect((errorFrame as { error: { status: number } }).error.status).toBe(500);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-agent routing integration (#12A)
  // -------------------------------------------------------------------------

  describe("multi-agent routing integration", () => {
    it("full flow: register with agentIds → binding resolves → dispatch", async () => {
      const { gateway, wss } = createTestGateway({
        bindings: [
          { agentId: "work-agent", match: { channel: "slack" } },
          { agentId: "personal-agent", match: { channel: "whatsapp" } },
        ],
      });
      await gateway.start();

      // Register node-1 serving work-agent
      const ws1 = wss.connect("ws-1");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["work-agent"] },
        token: "test-key",
      });

      // Register node-2 serving personal-agent
      const ws2 = wss.connect("ws-2");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "node-2",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["personal-agent"] },
        token: "test-key",
      });

      // Bind channels for lane message delivery
      gateway.bindChannel("slack", "node-1");
      gateway.bindChannel("whatsapp", "node-2");

      // Send slack message from ws1 → should route to node-1 via binding
      sendFrame(ws1, {
        kind: "lane.message",
        lane: "steer",
        message: makeMessage({ channelId: "slack" }),
      });

      // Ack should come back
      const frames1 = ws1.sentFrames();
      expect(frames1.some((f) => f.kind === "lane.message.ack")).toBe(true);

      // Verify agent mapping
      const agentMap = gateway.getAgentToNodeMap();
      expect(agentMap.get("work-agent")).toBe("node-1");
      expect(agentMap.get("personal-agent")).toBe("node-2");

      await gateway.stop();
    });

    it("node deregistration clears agent index in registry", async () => {
      const { gateway, wss } = createTestGateway({
        bindings: [{ agentId: "test-agent", match: { channel: "slack" } }],
      });
      await gateway.start();

      const ws = wss.connect("ws-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["test-agent"] },
        token: "test-key",
      });

      expect(gateway.getAgentToNodeMap().get("test-agent")).toBe("node-1");

      // Deregister
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "node-1",
      });

      expect(gateway.getAgentToNodeMap().get("test-agent")).toBeUndefined();
      await gateway.stop();
    });

    it("binding resolver accessor returns resolver when bindings configured", () => {
      const { gateway } = createTestGateway({
        bindings: [{ agentId: "agent-a", match: { channel: "slack" } }],
      });
      expect(gateway.getBindingResolver()).toBeDefined();
    });

    it("binding resolver accessor returns undefined when no bindings", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getBindingResolver()).toBeUndefined();
    });

    it("multiple nodes with overlapping agentIds — last-write wins", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();

      const ws1 = wss.connect("ws-1");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["shared-agent"] },
        token: "test-key",
      });

      // node-2 also claims shared-agent — should overwrite
      const ws2 = wss.connect("ws-2");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "node-2",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["shared-agent"] },
        token: "test-key",
      });

      // Last registration wins
      expect(gateway.getAgentToNodeMap().get("shared-agent")).toBe("node-2");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // per-account-channel-peer integration (#9A)
  // -------------------------------------------------------------------------

  describe("per-account-channel-peer scoping", () => {
    it("two accounts on same channel, same peer → separate conversations", async () => {
      const { gateway, wss } = createTestGateway({
        defaultConversationScope: "per-account-channel-peer" as ConversationScope,
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("whatsapp", "agent-1");

      const router = gateway.getRouter();
      const msg = (accountId: string) => ({
        id: `msg-${accountId}`,
        lane: "steer" as const,
        channelId: "whatsapp",
        payload: {},
        timestamp: Date.now(),
        routingContext: { peerId: "peer-1", accountId, messageType: "dm" as const },
      });

      const r1 = router.routeWithScope(msg("personal"), "bot-1");
      const r2 = router.routeWithScope(msg("business"), "bot-1");

      expect(r1.key).not.toBe(r2.key);
      expect(r1.key).toContain("personal");
      expect(r2.key).toContain("business");
      expect(r1.degraded).toBe(false);
      expect(r2.degraded).toBe(false);

      // Both should have separate conversation store entries
      const store = gateway.getConversationStore();
      expect(store.size).toBe(2);

      await gateway.stop();
    });

    it("missing accountId degrades to per-channel-peer", async () => {
      const { gateway, wss } = createTestGateway({
        defaultConversationScope: "per-account-channel-peer" as ConversationScope,
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("whatsapp", "agent-1");

      const router = gateway.getRouter();
      const result = router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "whatsapp",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(result.degraded).toBe(true);
      expect(result.warnings[0]).toContain("accountId");
      // Should produce per-channel-peer key format
      expect(result.key).toBe("agent:bot-1:whatsapp:dm:peer-1");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Config hot-reload (#10A)
  // -------------------------------------------------------------------------

  describe("config hot-reload", () => {
    it("scope change clears conversation store", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      // Create a conversation binding
      const router = gateway.getRouter();
      router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(gateway.getConversationStore().size).toBe(1);

      // Simulate scope change via router (as config watcher would do)
      router.setConversationScope("per-peer");
      gateway.getConversationStore().clear();

      expect(gateway.getConversationStore().size).toBe(0);
      expect(router.getConversationScope()).toBe("per-peer");

      await gateway.stop();
    });

    it("conversation store config update applies new TTL/capacity", () => {
      const { gateway } = createTestGateway();
      const store = gateway.getConversationStore();

      store.updateConfig({ maxConversations: 50, conversationTtl: 30_000 });

      // Verify new config takes effect (bind up to new max)
      for (let i = 0; i < 50; i++) {
        store.bind(`agent:a1:ch:dm:peer-${i}` as never, "node-1");
      }
      expect(store.size).toBe(50);

      // 51st should evict oldest
      store.bind("agent:a1:ch:dm:peer-overflow" as never, "node-1");
      expect(store.size).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // Degradation handler (#6A verification)
  // -------------------------------------------------------------------------

  describe("degradation handler", () => {
    it("onDegradation fires when key resolution degrades (missing accountId)", async () => {
      const { gateway, wss } = createTestGateway({
        defaultConversationScope: "per-account-channel-peer",
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      const router = gateway.getRouter();
      const handler = vi.fn();
      router.onDegradation(handler);

      // Route with peerId but missing accountId → degrades and fires handler
      router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        "bot-1",
        expect.arrayContaining([expect.stringContaining("accountId")]),
      );

      await gateway.stop();
    });

    it("onDegradation does not fire when key resolves normally", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");

      const router = gateway.getRouter();
      const handler = vi.fn();
      router.onDegradation(handler);

      router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );

      expect(handler).not.toHaveBeenCalled();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-agent routing + conversation scoping integration (#11)
  // -------------------------------------------------------------------------

  describe("multi-agent routing + conversation scoping", () => {
    it("binding resolver + routeWithScope produces per-agent conversation keys", async () => {
      const { gateway, wss } = createTestGateway({
        bindings: [
          { agentId: "work-agent", match: { channel: "slack" } },
          { agentId: "personal-agent", match: { channel: "whatsapp" } },
        ],
      });
      await gateway.start();

      // Register two nodes, each serving a different agent
      const ws1 = wss.connect("ws-1");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["work-agent"] },
        token: "test-key",
      });

      const ws2 = wss.connect("ws-2");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "node-2",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["personal-agent"] },
        token: "test-key",
      });

      gateway.bindChannel("slack", "node-1");
      gateway.bindChannel("whatsapp", "node-2");

      const router = gateway.getRouter();

      // Same peer messages two different agents via two channels
      const r1 = router.routeWithScope(
        {
          id: "msg-slack",
          lane: "steer",
          channelId: "slack",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "work-agent",
      );

      const r2 = router.routeWithScope(
        {
          id: "msg-whatsapp",
          lane: "steer",
          channelId: "whatsapp",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "personal-agent",
      );

      // Different agents → different conversation keys
      expect(r1.key).not.toBe(r2.key);
      expect(r1.key).toContain("work-agent");
      expect(r2.key).toContain("personal-agent");

      // Both should have conversation store bindings
      const store = gateway.getConversationStore();
      expect(store.get(r1.key)?.nodeId).toBe("node-1");
      expect(store.get(r2.key)?.nodeId).toBe("node-2");
      expect(store.size).toBe(2);

      await gateway.stop();
    });

    it("agent-level scope override with multi-agent routing", async () => {
      const { gateway, wss } = createTestGateway({
        bindings: [
          { agentId: "shared-agent", match: { channel: "slack" } },
          { agentId: "isolated-agent", match: { channel: "telegram" } },
        ],
      });
      await gateway.start();

      const ws = wss.connect("ws-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: { ...DEFAULT_CAPS, agentIds: ["shared-agent", "isolated-agent"] },
        token: "test-key",
      });

      gateway.bindChannel("slack", "node-1");
      gateway.bindChannel("telegram", "node-1");

      const router = gateway.getRouter();
      // shared-agent uses main scope (all peers share one conversation)
      router.setAgentScope("shared-agent", "main");
      // isolated-agent keeps gateway default (per-channel-peer)

      const rShared = router.routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "slack",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "shared-agent",
      );

      const rIsolated = router.routeWithScope(
        {
          id: "msg-2",
          lane: "steer",
          channelId: "telegram",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "isolated-agent",
      );

      // shared-agent uses main scope → key does not contain peerId
      expect(rShared.key).toBe("agent:shared-agent:main");
      expect(rShared.effectiveScope).toBe("main");

      // isolated-agent uses per-channel-peer → key contains channel + peerId
      expect(rIsolated.key).toBe("agent:isolated-agent:telegram:dm:peer-1");
      expect(rIsolated.effectiveScope).toBe("per-channel-peer");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Session identity tracking (#79)
  // -------------------------------------------------------------------------

  describe("session identity tracking", () => {
    it("session ack contains UUID sessionId", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const ackFrame = ws.sentFrames().find((f) => f.kind === "node.register.ack");
      expect(ackFrame).toBeDefined();
      if (ackFrame?.kind === "node.register.ack") {
        // UUID v4 format
        expect(ackFrame.sessionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }

      await gateway.stop();
    });

    it("updateSessionIdentity sets identity and emits frame", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const identity = {
        identity: { name: "Test Bot", avatar: "https://a.png" },
        channelType: "slack",
        agentId: "agent-1",
      };
      const changed = gateway.updateSessionIdentity("agent-1", identity);
      expect(changed).toBe(true);

      // Verify identity is stored
      expect(gateway.getSessionIdentity("agent-1")).toEqual(identity);

      // Verify identity update frame was sent
      const identityFrame = ws.sentFrames().find((f) => f.kind === "session.identity.update");
      expect(identityFrame).toBeDefined();
      if (identityFrame?.kind === "session.identity.update") {
        expect(identityFrame.identity).toEqual({ name: "Test Bot", avatar: "https://a.png" });
        expect(identityFrame.nodeId).toBe("agent-1");
      }

      await gateway.stop();
    });

    it("updateSessionIdentity returns false when identity unchanged", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const identity = { identity: { name: "Bot" }, channelType: "slack" };
      gateway.updateSessionIdentity("agent-1", identity);

      // Clear sent frames count
      const framesBefore = ws.sentFrames().length;

      // Same identity again
      const changed = gateway.updateSessionIdentity("agent-1", identity);
      expect(changed).toBe(false);

      // No new frames sent
      expect(ws.sentFrames().length).toBe(framesBefore);

      await gateway.stop();
    });

    it("getSessionIdentity returns undefined for new session", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(gateway.getSessionIdentity("agent-1")).toBeUndefined();
      await gateway.stop();
    });

    it("session.update frame emitted on state transitions", async () => {
      vi.useFakeTimers();
      // Use short session timeout + long health check to avoid health monitor interference
      const { gateway, wss } = createTestGateway({
        sessionTimeout: 5_000,
        healthCheckInterval: 600_000,
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Advance to trigger CONNECTED → IDLE
      vi.advanceTimersByTime(5_000);

      const updateFrame = ws.sentFrames().find((f) => f.kind === "session.update");
      expect(updateFrame).toBeDefined();
      if (updateFrame?.kind === "session.update") {
        expect(updateFrame.state).toBe("idle");
        expect(updateFrame.nodeId).toBe("agent-1");
        expect(updateFrame.sessionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }

      vi.useRealTimers();
      await gateway.stop();
    });

    it("identity persists after session state transition", async () => {
      vi.useFakeTimers();
      // Use short session timeout + long health check to avoid health monitor interference
      const { gateway, wss } = createTestGateway({
        sessionTimeout: 5_000,
        healthCheckInterval: 600_000,
      });
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const identity = { identity: { name: "Bot" }, channelType: "slack" };
      gateway.updateSessionIdentity("agent-1", identity);

      // Advance to IDLE
      vi.advanceTimersByTime(5_000);

      // Identity should persist
      expect(gateway.getSessionIdentity("agent-1")).toEqual(identity);

      vi.useRealTimers();
      await gateway.stop();
    });

    it("identity is cleared on node deregistration", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.updateSessionIdentity("agent-1", {
        identity: { name: "Bot" },
        channelType: "slack",
      });

      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
      });

      // Identity should be gone
      expect(gateway.getSessionIdentity("agent-1")).toBeUndefined();
      await gateway.stop();
    });
  });
});
