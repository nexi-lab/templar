import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CheckpointStore } from "../checkpoint/checkpoint-store.js";
import type { GatewayCheckpoint } from "../checkpoint/types.js";
import type { TemplarGatewayDeps } from "../gateway.js";
import { TemplarGateway } from "../gateway.js";
import type { ConversationKey, GatewayFrame } from "../protocol/index.js";
import type { WsServerFactory } from "../server.js";
import { createMockWss, DEFAULT_CAPS, DEFAULT_CONFIG, sendFrame } from "./helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInMemoryCheckpointStore(): CheckpointStore & {
  saved: GatewayCheckpoint | undefined;
} {
  let stored: GatewayCheckpoint | undefined;
  return {
    get saved() {
      return stored;
    },
    async save(checkpoint: GatewayCheckpoint) {
      stored = checkpoint;
    },
    async load() {
      return stored;
    },
  };
}

function createTestGatewayWithCheckpoint(
  checkpointStore?: CheckpointStore,
  configOverrides: Partial<typeof DEFAULT_CONFIG> = {},
) {
  const wss = createMockWss();
  const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const deps: TemplarGatewayDeps = {
    wsFactory: factory,
    configWatcherDeps: {
      watch: () => ({
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
    ...(checkpointStore ? { checkpointStore } : {}),
  };
  const gateway = new TemplarGateway(config, deps);
  return { gateway, wss };
}

function registerNode(
  wss: ReturnType<typeof createMockWss>,
  nodeId: string,
  capabilities = DEFAULT_CAPS,
) {
  const ws = wss.connect(`ws-${nodeId}`);
  sendFrame(ws, {
    kind: "node.register",
    nodeId,
    capabilities,
    token: "test-key",
  });
  return ws;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkpoint recovery", () => {
  // -------------------------------------------------------------------------
  // No checkpoint store (graceful no-op)
  // -------------------------------------------------------------------------

  it("starts cleanly without checkpointStore", async () => {
    const { gateway } = createTestGatewayWithCheckpoint();
    await gateway.start();
    expect(gateway.nodeCount).toBe(0);
    await gateway.stop();
  });

  // -------------------------------------------------------------------------
  // Load on start
  // -------------------------------------------------------------------------

  it("loads checkpoint on start when checkpointStore provided", async () => {
    const store = createInMemoryCheckpointStore();

    // Phase 1: populate and save
    const { gateway: gw1, wss: wss1 } = createTestGatewayWithCheckpoint(store);
    await gw1.start();
    registerNode(wss1, "node-1");
    await gw1.saveCheckpoint();
    expect(store.saved).toBeDefined();
    await gw1.stop();

    // Phase 2: new gateway loads the checkpoint
    const { gateway: gw2 } = createTestGatewayWithCheckpoint(store);
    await gw2.start();
    expect(gw2.getSessionManager().getSession("node-1")).toBeDefined();
    await gw2.stop();
  });

  it("restores all three stores from valid checkpoint", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway: gw1, wss: wss1 } = createTestGatewayWithCheckpoint(store);
    await gw1.start();

    // Register node, create conversation, track delivery
    registerNode(wss1, "node-1");
    gw1.bindChannel("ch-1", "node-1");
    gw1.getRouter().routeWithScope(
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
    // Track a delivery
    gw1.getDeliveryTracker().track("node-1", {
      id: "msg-2",
      lane: "steer",
      channelId: "ch-1",
      payload: null,
      timestamp: Date.now(),
    });

    await gw1.saveCheckpoint();
    await gw1.stop();

    // Restore
    const { gateway: gw2 } = createTestGatewayWithCheckpoint(store);
    await gw2.start();

    expect(gw2.getSessionManager().getSession("node-1")).toBeDefined();
    expect(gw2.getConversationStore().size).toBeGreaterThan(0);
    expect(gw2.getDeliveryTracker().pendingCount("node-1")).toBe(1);

    await gw2.stop();
  });

  it("starts clean when load() returns undefined", async () => {
    const store: CheckpointStore = {
      save: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
    };
    const { gateway } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    expect(gateway.getSessionManager().getAllSessions()).toHaveLength(0);
    await gateway.stop();
  });

  it("starts clean when checkpoint fails schema validation", async () => {
    const store: CheckpointStore = {
      save: vi.fn(),
      load: vi.fn().mockResolvedValue({ version: 999, bad: true }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { gateway } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    expect(gateway.getSessionManager().getAllSessions()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("checkpoint"), expect.anything());
    warnSpy.mockRestore();
    await gateway.stop();
  });

  it("starts clean when checkpoint fails invariant check", async () => {
    // Build a checkpoint with orphaned conversation binding
    const badCheckpoint: GatewayCheckpoint = {
      version: 1,
      checkpointId: randomUUID(),
      createdAt: Date.now(),
      sessions: { version: 1, sessions: [], capturedAt: Date.now() },
      conversations: {
        version: 1,
        bindings: [
          {
            conversationKey: "orphan" as ConversationKey,
            nodeId: "dead-node",
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          },
        ],
        capturedAt: Date.now(),
      },
      deliveries: { version: 1, pending: {}, capturedAt: Date.now() },
    };
    const store: CheckpointStore = {
      save: vi.fn(),
      load: vi.fn().mockResolvedValue(badCheckpoint),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { gateway } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    expect(gateway.getSessionManager().getAllSessions()).toHaveLength(0);
    expect(gateway.getConversationStore().size).toBe(0);
    warnSpy.mockRestore();
    await gateway.stop();
  });

  it("starts clean when load() throws (graceful degradation)", async () => {
    const store: CheckpointStore = {
      save: vi.fn(),
      load: vi.fn().mockRejectedValue(new Error("disk failure")),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { gateway } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    expect(gateway.getSessionManager().getAllSessions()).toHaveLength(0);
    warnSpy.mockRestore();
    await gateway.stop();
  });

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  it("saveCheckpoint() saves when state is valid", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    await gateway.saveCheckpoint();
    expect(store.saved).toBeDefined();
    expect(store.saved?.sessions.sessions).toHaveLength(1);

    await gateway.stop();
  });

  it("saveCheckpoint() skips save when invariant check fails", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    // Save a valid checkpoint first
    await gateway.saveCheckpoint();
    const firstCheckpoint = store.saved;

    // Create an orphaned delivery (node-1 session exists, but add delivery for "dead-node")
    gateway.getDeliveryTracker().track("dead-node", {
      id: "msg-orphan",
      lane: "steer",
      channelId: "ch-1",
      payload: null,
      timestamp: Date.now(),
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await gateway.saveCheckpoint();
    warnSpy.mockRestore();

    // Should NOT have overwritten with bad data
    expect(store.saved?.checkpointId).toBe(firstCheckpoint?.checkpointId);

    await gateway.stop();
  });

  it("saves final checkpoint on stop()", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    // stop() should trigger a save
    await gateway.stop();
    expect(store.saved).toBeDefined();
  });

  it("save() failure is non-fatal", async () => {
    const store: CheckpointStore = {
      save: vi.fn().mockRejectedValue(new Error("write failed")),
      load: vi.fn().mockResolvedValue(undefined),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    // Should not throw
    await expect(gateway.saveCheckpoint()).resolves.toBeUndefined();
    warnSpy.mockRestore();
    await gateway.stop();
  });

  // -------------------------------------------------------------------------
  // End-to-end round-trip
  // -------------------------------------------------------------------------

  it("end-to-end: register → save → stop → reload → verify state", async () => {
    const store = createInMemoryCheckpointStore();

    // Phase 1: setup
    const { gateway: gw1, wss: wss1 } = createTestGatewayWithCheckpoint(store);
    await gw1.start();
    registerNode(wss1, "node-1");
    registerNode(wss1, "node-2");
    gw1.bindChannel("ch-1", "node-1");
    gw1.getRouter().routeWithScope(
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

    await gw1.saveCheckpoint();
    await gw1.stop();

    // Phase 2: reload
    const { gateway: gw2, wss: wss2 } = createTestGatewayWithCheckpoint(store);
    await gw2.start();

    // Verify restored state
    expect(gw2.getSessionManager().getSession("node-1")).toBeDefined();
    expect(gw2.getSessionManager().getSession("node-2")).toBeDefined();
    expect(gw2.getConversationStore().size).toBe(1);

    // Verify new registrations work after restore
    registerNode(wss2, "node-3");
    expect(gw2.getSessionManager().getSession("node-3")).toBeDefined();

    await gw2.stop();
  });

  it("restored sessions don't have running timers", async () => {
    vi.useFakeTimers();
    const store = createInMemoryCheckpointStore();

    // Phase 1: setup with short session timeout
    const { gateway: gw1, wss: wss1 } = createTestGatewayWithCheckpoint(store, {
      sessionTimeout: 5_000,
      healthCheckInterval: 600_000,
    });
    await gw1.start();
    registerNode(wss1, "node-1");
    await gw1.saveCheckpoint();
    await gw1.stop();

    // Phase 2: restore
    const { gateway: gw2 } = createTestGatewayWithCheckpoint(store, {
      sessionTimeout: 5_000,
      healthCheckInterval: 600_000,
    });
    await gw2.start();

    // Advance past session timeout — restored session should NOT transition
    // because fromSnapshot() does NOT start timers
    vi.advanceTimersByTime(10_000);

    const session = gw2.getSessionManager().getSession("node-1");
    expect(session).toBeDefined();
    expect(session?.state).toBe("connected");

    vi.useRealTimers();
    await gw2.stop();
  });

  it("after restore, new node.register works correctly", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway: gw1, wss: wss1 } = createTestGatewayWithCheckpoint(store);
    await gw1.start();
    registerNode(wss1, "node-1");
    await gw1.saveCheckpoint();
    await gw1.stop();

    const { gateway: gw2, wss: wss2 } = createTestGatewayWithCheckpoint(store);
    await gw2.start();

    // Register a new node on the restored gateway
    const ws = registerNode(wss2, "new-node");
    const ackFrame = ws.sentFrames().find((f: GatewayFrame) => f.kind === "node.register.ack");
    expect(ackFrame).toBeDefined();
    expect(gw2.getSessionManager().getSession("new-node")).toBeDefined();

    await gw2.stop();
  });

  // -------------------------------------------------------------------------
  // checkInvariants() public API
  // -------------------------------------------------------------------------

  it("checkInvariants() returns healthy result for valid state", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    const result = gateway.checkInvariants();
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);

    await gateway.stop();
  });

  it("checkInvariants() detects orphaned deliveries", async () => {
    const store = createInMemoryCheckpointStore();
    const { gateway, wss } = createTestGatewayWithCheckpoint(store);
    await gateway.start();
    registerNode(wss, "node-1");

    // Inject orphaned delivery
    gateway.getDeliveryTracker().track("dead-node", {
      id: "msg-1",
      lane: "steer",
      channelId: "ch-1",
      payload: null,
      timestamp: Date.now(),
    });

    const result = gateway.checkInvariants();
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === "delivery-orphan")).toBe(true);

    await gateway.stop();
  });
});
