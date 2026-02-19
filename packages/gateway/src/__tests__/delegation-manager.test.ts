import { afterEach, describe, expect, it, vi } from "vitest";
import { DelegationManager, type DelegationManagerConfig } from "../delegation-manager.js";
import type { DelegationStore } from "../delegation-store.js";
import type { DelegationRequestFrame, GatewayFrame } from "../protocol/frames.js";
import type { LaneMessage } from "../protocol/lanes.js";
import { NodeRegistry } from "../registry/node-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CAPS = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

function makePayload(overrides: Partial<LaneMessage> = {}): LaneMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    lane: "steer",
    channelId: "ch-1",
    payload: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<DelegationRequestFrame> = {}): DelegationRequestFrame {
  return {
    kind: "delegation.request",
    delegationId: `del-${Math.random().toString(36).slice(2)}`,
    fromNodeId: "node-from",
    toNodeId: "node-primary",
    scope: {},
    intent: "test-task",
    payload: makePayload(),
    fallbackNodeIds: [],
    timeoutMs: 5000,
    ...overrides,
  };
}

interface TestContext {
  registry: NodeRegistry;
  sentFrames: GatewayFrame[];
  sendToNode: (nodeId: string, frame: GatewayFrame) => void;
  manager: DelegationManager;
  now: number;
}

function setup(
  configOverrides: Partial<DelegationManagerConfig> = {},
  store?: DelegationStore,
): TestContext {
  const registry = new NodeRegistry();
  const sentFrames: GatewayFrame[] = [];
  const sendToNode = (_nodeId: string, frame: GatewayFrame) => {
    sentFrames.push(frame);
  };

  let now = 1000;

  const config: Partial<DelegationManagerConfig> = {
    maxActiveDelegations: 10,
    maxPerNodeDelegations: 5,
    maxDelegationTtlMs: 60_000,
    sweepIntervalMs: 10_000,
    minNodeTimeoutMs: 500,
    circuitBreaker: { threshold: 3, cooldownMs: 5000 },
    storeTimeoutMs: 1000,
    ...configOverrides,
  };

  const manager = new DelegationManager(config, registry, sendToNode, store, () => now);

  return {
    registry,
    sentFrames,
    sendToNode,
    manager,
    get now() {
      return now;
    },
    set now(v: number) {
      now = v;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DelegationManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe("happy path", () => {
    it("request → accept → completed", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({ delegationId: "del-1" });

      const resultPromise = ctx.manager.delegate(req);

      // Simulate primary node accepting and completing
      ctx.manager.handleDelegationFrame({
        kind: "delegation.accept",
        delegationId: "del-1",
        nodeId: "node-primary",
      });

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-1",
        status: "completed",
        result: { answer: 42 },
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
      expect(result.result).toEqual({ answer: 42 });
      expect(ctx.manager.activeCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback scenarios
  // -------------------------------------------------------------------------

  describe("fallback", () => {
    it("primary refuses → fallback succeeds", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);
      ctx.registry.register("node-fallback", DEFAULT_CAPS);

      const req = makeRequest({
        delegationId: "del-2",
        fallbackNodeIds: ["node-fallback"],
      });

      const resultPromise = ctx.manager.delegate(req);

      // Primary refuses — handleDelegationFrame resolves tryNode with the result
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-2",
        status: "refused",
      });

      // Wait a tick for fallback to start
      await new Promise((r) => setTimeout(r, 10));

      // Fallback completes
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-2",
        status: "completed",
        result: "fallback-result",
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
    });

    it("primary fails → fallback 1 fails → fallback 2 succeeds", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);
      ctx.registry.register("fb-1", DEFAULT_CAPS);
      ctx.registry.register("fb-2", DEFAULT_CAPS);

      const req = makeRequest({
        delegationId: "del-3",
        fallbackNodeIds: ["fb-1", "fb-2"],
        timeoutMs: 30_000,
      });

      const resultPromise = ctx.manager.delegate(req);

      // Primary fails
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-3",
        status: "failed",
      });

      await new Promise((r) => setTimeout(r, 10));

      // Fallback 1 fails
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-3",
        status: "failed",
      });

      await new Promise((r) => setTimeout(r, 10));

      // Fallback 2 succeeds
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-3",
        status: "completed",
        result: "fb2-ok",
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
    });

    it("empty fallback list → only primary tried", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({
        delegationId: "del-empty",
        fallbackNodeIds: [],
      });

      const resultPromise = ctx.manager.delegate(req);

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-empty",
        status: "completed",
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
    });
  });

  // -------------------------------------------------------------------------
  // Exhausted
  // -------------------------------------------------------------------------

  describe("exhausted", () => {
    it("all nodes fail → exhausted event", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      // Primary and fallback are not registered → unavailable

      const events: string[] = [];
      ctx.manager.events.on("delegation.exhausted", (id) => {
        events.push(id);
      });

      const req = makeRequest({
        delegationId: "del-exhaust",
        toNodeId: "dead-primary",
        fallbackNodeIds: ["dead-fb"],
      });

      const result = await ctx.manager.delegate(req);
      expect(result.status).toBe("failed");
      expect(events).toContain("del-exhaust");
    });
  });

  // -------------------------------------------------------------------------
  // Capacity limits
  // -------------------------------------------------------------------------

  describe("capacity limits", () => {
    it("max active delegations → rejection", async () => {
      const ctx = setup({ maxActiveDelegations: 1 });
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      // First delegation (hangs — no response sent)
      void ctx.manager.delegate(makeRequest({ delegationId: "del-a" }));

      // Second should be rejected
      const result = await ctx.manager.delegate(makeRequest({ delegationId: "del-b" }));
      expect(result.status).toBe("failed");
    });

    it("max per-node delegations → rejection", async () => {
      const ctx = setup({ maxPerNodeDelegations: 1 });
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      // First delegation from node-from (hangs)
      void ctx.manager.delegate(
        makeRequest({
          delegationId: "del-x",
          fromNodeId: "node-from",
        }),
      );

      // Second from same node should be rejected
      const result = await ctx.manager.delegate(
        makeRequest({
          delegationId: "del-y",
          fromNodeId: "node-from",
        }),
      );
      expect(result.status).toBe("failed");
    });
  });

  // -------------------------------------------------------------------------
  // Circuit breaker integration
  // -------------------------------------------------------------------------

  describe("circuit breaker", () => {
    it("primary circuit open → skip to first fallback", async () => {
      const ctx = setup({ circuitBreaker: { threshold: 1, cooldownMs: 60_000 } });
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);
      ctx.registry.register("node-fallback", DEFAULT_CAPS);

      // First delegation to primary fails → opens circuit
      const req1 = makeRequest({ delegationId: "del-cb1" });
      const p1 = ctx.manager.delegate(req1);
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-cb1",
        status: "failed",
      });
      await p1;

      // Second delegation: primary circuit is open, should go to fallback
      const req2 = makeRequest({
        delegationId: "del-cb2",
        fallbackNodeIds: ["node-fallback"],
      });
      const p2 = ctx.manager.delegate(req2);

      // Wait for the fallback tryNode to start
      await new Promise((r) => setTimeout(r, 10));

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-cb2",
        status: "completed",
        result: "from-fallback",
      });
      const result = await p2;
      expect(result.status).toBe("completed");
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("cancel in-flight → cancel frame sent and delegation aborted", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({ delegationId: "del-cancel" });
      const resultPromise = ctx.manager.delegate(req);

      // Cancel it
      ctx.manager.cancel("del-cancel", "user cancelled");

      const result = await resultPromise;
      // Cancel aborts → tryNode returns null → delegate sees aborted → returns timeout
      expect(result.status).toBe("timeout");

      // Should have sent cancel frame
      const cancelFrames = ctx.sentFrames.filter((f) => f.kind === "delegation.cancel");
      expect(cancelFrames.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Store integration
  // -------------------------------------------------------------------------

  describe("store integration", () => {
    it("store create timeout → delegation proceeds anyway", async () => {
      const slowStore: DelegationStore = {
        create: () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  delegationId: "x",
                  fromNodeId: "x",
                  toNodeId: "x",
                  intent: "x",
                  status: "pending" as const,
                  createdAt: 0,
                  updatedAt: 0,
                }),
              10_000,
            ),
          ),
        update: vi.fn().mockResolvedValue(undefined),
      };

      const ctx = setup({ storeTimeoutMs: 50 }, slowStore);
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({ delegationId: "del-slow-store" });
      const resultPromise = ctx.manager.delegate(req);

      // Wait for store timeout + tryNode to start
      await new Promise((r) => setTimeout(r, 100));

      // Even though store was slow, delegation should have proceeded
      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-slow-store",
        status: "completed",
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
    });

    it("store not injected → works in-memory only", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({ delegationId: "del-no-store" });
      const resultPromise = ctx.manager.delegate(req);

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-no-store",
        status: "completed",
      });

      const result = await resultPromise;
      expect(result.status).toBe("completed");
    });
  });

  // -------------------------------------------------------------------------
  // Sweep / cleanup
  // -------------------------------------------------------------------------

  describe("sweep and cleanup", () => {
    it("dispose aborts all in-flight delegations", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({ delegationId: "del-dispose" });
      const resultPromise = ctx.manager.delegate(req);

      ctx.manager.dispose();

      const result = await resultPromise;
      // Dispose aborts → timeout status
      expect(result.status).toBe("timeout");
      expect(ctx.manager.activeCount).toBe(0);
    });

    it("cleanupNode cancels delegations to/from that node", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const events: string[] = [];
      ctx.manager.events.on("delegation.cancelled", (id) => {
        events.push(id);
      });

      const req = makeRequest({
        delegationId: "del-cleanup",
        fromNodeId: "node-from",
        toNodeId: "node-primary",
      });
      const resultPromise = ctx.manager.delegate(req);

      ctx.manager.cleanupNode("node-primary");

      const result = await resultPromise;
      // Cleanup → cancel → abort → timeout
      expect(result.status).toBe("timeout");
      expect(events).toContain("del-cleanup");
    });
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  describe("events", () => {
    it("emits delegation.started on delegate()", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const started: string[] = [];
      ctx.manager.events.on("delegation.started", (id) => started.push(id));

      const req = makeRequest({ delegationId: "del-evt" });
      const p = ctx.manager.delegate(req);

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-evt",
        status: "completed",
      });
      await p;

      expect(started).toContain("del-evt");
    });

    it("emits delegation.completed on successful result", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const completed: string[] = [];
      ctx.manager.events.on("delegation.completed", (id) => completed.push(id));

      const req = makeRequest({ delegationId: "del-comp" });
      const p = ctx.manager.delegate(req);

      ctx.manager.handleDelegationFrame({
        kind: "delegation.result",
        delegationId: "del-comp",
        status: "completed",
      });
      await p;

      expect(completed).toContain("del-comp");
    });
  });

  // -------------------------------------------------------------------------
  // Node disconnect mid-delegation
  // -------------------------------------------------------------------------

  describe("node disconnect", () => {
    it("node disconnect mid-delegation → cleanup", async () => {
      const ctx = setup();
      ctx.registry.register("node-from", DEFAULT_CAPS);
      ctx.registry.register("node-primary", DEFAULT_CAPS);

      const req = makeRequest({
        delegationId: "del-disconnect",
        toNodeId: "node-primary",
      });
      const resultPromise = ctx.manager.delegate(req);

      // Simulate node going away
      ctx.manager.cleanupNode("node-primary");

      const result = await resultPromise;
      // Cleanup cancels → abort → timeout
      expect(result.status).toBe("timeout");
    });
  });
});
