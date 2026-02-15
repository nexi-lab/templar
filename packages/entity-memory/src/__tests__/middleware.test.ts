import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityMemoryMiddleware } from "../middleware.js";

// ============================================================================
// HELPERS
// ============================================================================

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    userId: "test-user",
    ...overrides,
  };
}

function createTurnContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    sessionId: "test-session-1",
    turnNumber: 1,
    ...overrides,
  };
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

describe("EntityMemoryMiddleware", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create middleware with valid config", () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      expect(mw.name).toBe("entity-memory");
    });

    it("should throw on invalid config", () => {
      expect(
        () => new EntityMemoryMiddleware(mockClient.client, { scope: "bad" as "agent" }),
      ).toThrow();
    });
  });

  describe("onSessionStart", () => {
    it("should load entities from Nexus API", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person", attributes: {} },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      expect(mw.getSessionEntities()).toHaveLength(1);
      expect(mw.getSessionEntities()[0]?.name).toBe("Alice");
    });

    it("should query with memory_type=entity", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      const queryArgs = mockClient.mockMemory.query.mock.calls[0]?.[0];
      expect(queryArgs.memory_type).toBe("entity");
      expect(queryArgs.scope).toBe("agent");
    });

    it("should handle API timeout gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Simulate a slow query that exceeds timeout
      mockClient.mockMemory.query.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ results: [], total: 0, filters: {} }), 10000),
          ),
      );

      const mw = new EntityMemoryMiddleware(mockClient.client, {
        scope: "agent",
        sessionStartTimeoutMs: 10,
      });

      await mw.onSessionStart(createSessionContext());

      expect(mw.getSessionEntities()).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should handle API error gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockClient.mockMemory.query.mockRejectedValue(new Error("Connection refused"));

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      expect(mw.getSessionEntities()).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should reset turn count and pending buffer", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });

      // Simulate some existing state
      await mw.onAfterTurn(
        createTurnContext({ output: "Some long output that has entity data for extraction" }),
      );
      expect(mw.getPendingCount()).toBeGreaterThan(0);

      await mw.onSessionStart(createSessionContext());
      expect(mw.getPendingCount()).toBe(0);
    });

    it("should include namespace in query when configured", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, {
        scope: "agent",
        namespace: "test-ns",
      });
      await mw.onSessionStart(createSessionContext());

      const queryArgs = mockClient.mockMemory.query.mock.calls[0]?.[0];
      expect(queryArgs.namespace).toBe("test-ns");
    });
  });

  describe("onBeforeTurn", () => {
    it("should inject entities into context metadata", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person", attributes: {} },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext();
      await mw.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata).toBeDefined();
      expect(turnCtx.metadata?.entities).toBeDefined();
      expect((turnCtx.metadata?.entities as unknown[]).length).toBe(1);
    });

    it("should not inject if no entities loaded", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext();
      await mw.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata).toBeUndefined();
    });

    it("should preserve existing metadata", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person", attributes: {} },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext({ metadata: { existing: "data" } });
      await mw.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata?.existing).toBe("data");
      expect(turnCtx.metadata?.entities).toBeDefined();
    });
  });

  describe("onAfterTurn", () => {
    it("should buffer store params from turn output", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });

      await mw.onAfterTurn(
        createTurnContext({
          output: "Alice works at Acme Corporation as a senior engineer",
        }),
      );

      expect(mw.getPendingCount()).toBe(1);
    });

    it("should skip short outputs", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });

      await mw.onAfterTurn(createTurnContext({ output: "OK" }));

      expect(mw.getPendingCount()).toBe(0);
    });

    it("should skip null/undefined output", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });

      await mw.onAfterTurn(createTurnContext({ output: null }));
      await mw.onAfterTurn(createTurnContext({ output: undefined }));

      expect(mw.getPendingCount()).toBe(0);
    });

    it("should flush on autoSaveInterval", async () => {
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 1,
        failed: 0,
        memory_ids: ["m1"],
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, {
        scope: "agent",
        autoSaveInterval: 2,
      });

      await mw.onAfterTurn(
        createTurnContext({ output: "First turn with enough content for extraction" }),
      );
      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();

      await mw.onAfterTurn(
        createTurnContext({ output: "Second turn triggers flush with more content" }),
      );
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledOnce();
      expect(mw.getPendingCount()).toBe(0);
    });

    it("should retain buffer on flush failure", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockClient.mockMemory.batchStore.mockRejectedValue(new Error("API error"));

      const mw = new EntityMemoryMiddleware(mockClient.client, {
        scope: "agent",
        autoSaveInterval: 1,
      });

      await mw.onAfterTurn(
        createTurnContext({ output: "Content that triggers immediate flush on first turn" }),
      );

      // Buffer retained for retry
      expect(mw.getPendingCount()).toBe(1);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should use NexusEntityExtractor buildStoreParams", async () => {
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 1,
        failed: 0,
        memory_ids: ["m1"],
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, {
        scope: "agent",
        autoSaveInterval: 1,
      });

      await mw.onAfterTurn(
        createTurnContext({ output: "Alice manages Bob at the headquarters building" }),
      );

      const batchArgs = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
      expect(batchArgs.memories[0].extract_entities).toBe(true);
      expect(batchArgs.memories[0].extract_relationships).toBe(true);
      expect(batchArgs.memories[0].store_to_graph).toBe(true);
    });
  });

  describe("onSessionEnd", () => {
    it("should flush remaining buffer", async () => {
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 1,
        failed: 0,
        memory_ids: ["m1"],
      });

      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });

      await mw.onAfterTurn(
        createTurnContext({
          output: "Some turn content that creates pending items for the buffer",
        }),
      );
      expect(mw.getPendingCount()).toBe(1);

      await mw.onSessionEnd(createSessionContext());
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledOnce();
      expect(mw.getPendingCount()).toBe(0);
    });

    it("should not call batchStore if buffer is empty", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
      await mw.onSessionEnd(createSessionContext());

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });
  });
});
