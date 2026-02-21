/**
 * Integration tests for the TemplarGateway orchestrator.
 *
 * These tests exercise the full lifecycle:
 *   connect → register → heartbeat → lane message → deregister → disconnect
 *
 * All subsystems are wired together via the orchestrator.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointStore } from "../checkpoint/checkpoint-store.js";
import type { GatewayCheckpoint } from "../checkpoint/types.js";
import type { TemplarGatewayDeps } from "../gateway.js";
import { TemplarGateway } from "../gateway.js";
import type { NodeCapabilities } from "../protocol/index.js";
import type { WsServerFactory } from "../server.js";
import { closeWs, createMockWss, createTestGateway, DEFAULT_CONFIG, sendFrame } from "./helpers.js";

// ---------------------------------------------------------------------------
// Test-specific fixtures
// ---------------------------------------------------------------------------

const CAPS: NodeCapabilities = {
  agentTypes: ["high", "low"],
  tools: ["search", "calculator"],
  maxConcurrency: 8,
  channels: ["chat", "voice"],
};

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
      const { gateway, wss } = createTestGateway();
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

      // Should have sent lane.message.ack
      const msgAck = ws.sentFrames().find((f) => f.kind === "lane.message.ack");
      expect(msgAck).toBeDefined();

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
      const { gateway, wss } = createTestGateway();
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
      const { gateway, wss } = createTestGateway({ sessionTimeout: 1000 });
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
      const { gateway, wss } = createTestGateway({ sessionTimeout: 1000 });
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
      const { gateway, wss } = createTestGateway({
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
      const { gateway, wss } = createTestGateway({ healthCheckInterval: 1000 });
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
      const { gateway, wss } = createTestGateway({ healthCheckInterval: 1000 });
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
      const { gateway, wss } = createTestGateway();
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

      // Drain and verify priority ordering
      const drained = gateway.drainNode("agent-1");
      expect(drained.map((m) => m.lane)).toEqual(["steer", "collect", "followup"]);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Error resilience
  // -------------------------------------------------------------------------

  describe("error resilience", () => {
    it("continues operating after invalid frame from one connection", async () => {
      const { gateway, wss } = createTestGateway();
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
      const { gateway, wss } = createTestGateway();
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
      const { gateway, wss } = createTestGateway();
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
      const { gateway } = createTestGateway();
      await gateway.start();

      // Try to bind to non-existent node
      const { GatewayNodeNotFoundError } = await import("@templar/errors");
      expect(() => gateway.bindChannel("ch-1", "nonexistent")).toThrow(GatewayNodeNotFoundError);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Checkpoint e2e lifecycle (#92)
  // -------------------------------------------------------------------------

  describe("checkpoint e2e lifecycle", () => {
    function createInMemoryStore(): CheckpointStore & { saved: GatewayCheckpoint | undefined } {
      let stored: GatewayCheckpoint | undefined;
      return {
        get saved() {
          return stored;
        },
        async save(cp: GatewayCheckpoint) {
          stored = cp;
        },
        async load() {
          return stored;
        },
      };
    }

    function createGatewayWithStore(
      store: CheckpointStore,
      overrides: Partial<typeof DEFAULT_CONFIG> = {},
    ) {
      const wss = createMockWss();
      const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
      const config = { ...DEFAULT_CONFIG, ...overrides };
      const deps: TemplarGatewayDeps = {
        wsFactory: factory,
        configWatcherDeps: {
          watch: () => ({ on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }),
        },
        checkpointStore: store,
      };
      return { gateway: new TemplarGateway(config, deps), wss };
    }

    it("full e2e: multi-node register → sweep saves → stop → restart → verify + new register", async () => {
      const store = createInMemoryStore();

      // Phase 1: Build state across multiple nodes
      const { gateway: gw1, wss: wss1 } = createGatewayWithStore(store, {
        healthCheckInterval: 1000,
        sessionTimeout: 60_000,
      });
      await gw1.start();

      // Register 3 nodes
      const ws1 = wss1.connect("ws-1");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: CAPS,
        token: "test-key",
      });
      const ws2 = wss1.connect("ws-2");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "node-2",
        capabilities: CAPS,
        token: "test-key",
      });
      const ws3 = wss1.connect("ws-3");
      sendFrame(ws3, {
        kind: "node.register",
        nodeId: "node-3",
        capabilities: CAPS,
        token: "test-key",
      });

      expect(gw1.nodeCount).toBe(3);

      // Bind channels and route messages to create conversation bindings
      gw1.bindChannel("slack", "node-1");
      gw1.bindChannel("telegram", "node-2");
      gw1.getRouter().routeWithScope(
        {
          id: "msg-1",
          lane: "steer",
          channelId: "slack",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-1", messageType: "dm" },
        },
        "bot-1",
      );
      gw1.getRouter().routeWithScope(
        {
          id: "msg-2",
          lane: "steer",
          channelId: "telegram",
          payload: {},
          timestamp: Date.now(),
          routingContext: { peerId: "peer-2", messageType: "dm" },
        },
        "bot-2",
      );

      // Track deliveries
      gw1.getDeliveryTracker().track("node-1", {
        id: "d1",
        lane: "steer",
        channelId: "slack",
        payload: null,
        timestamp: Date.now(),
      });
      gw1.getDeliveryTracker().track("node-2", {
        id: "d2",
        lane: "steer",
        channelId: "telegram",
        payload: null,
        timestamp: Date.now(),
      });

      // Deregister node-3 before saving — should NOT appear in checkpoint
      sendFrame(ws3, { kind: "node.deregister", nodeId: "node-3" });
      expect(gw1.nodeCount).toBe(2);

      // Health sweep triggers checkpoint save
      vi.advanceTimersByTime(1000);

      // Keep nodes alive so they aren't marked dead
      sendFrame(ws1, { kind: "heartbeat.pong", timestamp: Date.now() });
      sendFrame(ws2, { kind: "heartbeat.pong", timestamp: Date.now() });

      // Wait for async save
      await vi.advanceTimersByTimeAsync(0);
      expect(store.saved).toBeDefined();
      expect(store.saved?.sessions.sessions).toHaveLength(2);
      expect(store.saved?.conversations.bindings).toHaveLength(2);

      // Verify invariants pass
      const result = gw1.checkInvariants();
      expect(result.valid).toBe(true);

      await gw1.stop();

      // Phase 2: Restart from checkpoint
      const { gateway: gw2, wss: wss2 } = createGatewayWithStore(store, {
        healthCheckInterval: 1000,
        sessionTimeout: 60_000,
      });
      await gw2.start();

      // Verify all state restored
      expect(gw2.getSessionManager().getSession("node-1")).toBeDefined();
      expect(gw2.getSessionManager().getSession("node-2")).toBeDefined();
      expect(gw2.getSessionManager().getSession("node-3")).toBeUndefined();
      expect(gw2.getConversationStore().size).toBe(2);
      expect(gw2.getDeliveryTracker().pendingCount("node-1")).toBe(1);
      expect(gw2.getDeliveryTracker().pendingCount("node-2")).toBe(1);

      // Verify restored sessions don't have timers (no transitions happen)
      vi.advanceTimersByTime(120_000);
      expect(gw2.getSessionManager().getSession("node-1")?.state).toBe("connected");

      // Phase 3: New registrations work on restored gateway
      const ws4 = wss2.connect("ws-4");
      sendFrame(ws4, {
        kind: "node.register",
        nodeId: "node-4",
        capabilities: CAPS,
        token: "test-key",
      });

      const ack = ws4.sentFrames().find((f) => f.kind === "node.register.ack");
      expect(ack).toBeDefined();
      expect(gw2.getSessionManager().getSession("node-4")).toBeDefined();
      expect(gw2.getSessionManager().getSession("node-4")?.state).toBe("connected");

      // Invariants still healthy after new registrations
      expect(gw2.checkInvariants().valid).toBe(true);

      await gw2.stop();
    });

    it("corrupt checkpoint → clean start → normal operation", async () => {
      // Pre-load a corrupt checkpoint
      const store: CheckpointStore & { saved: GatewayCheckpoint | undefined } = {
        saved: undefined,
        async save(cp: GatewayCheckpoint) {
          this.saved = cp;
        },
        async load() {
          // Return garbage on first load
          return { version: 42, garbage: true } as unknown as GatewayCheckpoint;
        },
      };

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { gateway, wss } = createGatewayWithStore(store);
      await gateway.start();

      // Should have started clean despite corrupt checkpoint
      expect(gateway.getSessionManager().getAllSessions()).toHaveLength(0);

      // Normal operation works
      const ws = wss.connect("ws-1");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "node-1",
        capabilities: CAPS,
        token: "test-key",
      });
      expect(gateway.getSessionManager().getSession("node-1")).toBeDefined();

      warnSpy.mockRestore();
      await gateway.stop();
    });
  });
});
