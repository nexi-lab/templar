import type { SessionContext, TurnContext } from "@templar/core";
import { MemoryConfigurationError } from "@templar/errors";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusMemoryMiddleware, validateMemoryConfig } from "../middleware.js";
import type { NexusMemoryConfig } from "../types.js";

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    userId: "test-user",
    ...overrides,
  };
}

function createTurnContext(turnNumber: number, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    sessionId: "test-session-1",
    turnNumber,
    output: "This is a sufficiently long response for fact extraction to work.",
    ...overrides,
  };
}

function createConfig(overrides: Partial<NexusMemoryConfig> = {}): NexusMemoryConfig {
  return {
    scope: "agent",
    ...overrides,
  };
}

describe("NexusMemoryMiddleware", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create middleware with required config", () => {
      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      expect(middleware.name).toBe("nexus-memory");
    });

    it("should apply default config values", () => {
      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      expect(middleware).toBeDefined();
    });
  });

  describe("onSessionStart", () => {
    it("should query memories on session start", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [{ memory_id: "m1", content: "fact 1", scope: "agent", state: "active" }],
        total: 1,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockMemory.query).toHaveBeenCalledWith({
        scope: "agent",
        limit: 10,
      });
    });

    it("should include namespace in query when configured", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ namespace: "test-ns" }),
      );
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockMemory.query).toHaveBeenCalledWith({
        scope: "agent",
        limit: 10,
        namespace: "test-ns",
      });
    });

    it("should handle empty results without error", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await expect(middleware.onSessionStart(createSessionContext())).resolves.toBeUndefined();
    });

    it("should handle query failure gracefully", async () => {
      mockClient.mockMemory.query.mockRejectedValue(new Error("Network error"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await expect(middleware.onSessionStart(createSessionContext())).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed to load memories"),
        expect.stringContaining("Network error"),
      );
    });

    it("should handle query timeout gracefully", async () => {
      // Create a promise that never resolves
      mockClient.mockMemory.query.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ sessionStartTimeoutMs: 50 }),
      );
      await middleware.onSessionStart(createSessionContext());

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("memory query timed out"),
        // No second argument for timeout case
      );
    });

    it("should respect maxMemoriesPerQuery limit", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ maxMemoriesPerQuery: 25 }),
      );
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockMemory.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 }),
      );
    });
  });

  describe("onBeforeTurn", () => {
    it("should inject memories into context with session_start strategy", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [{ memory_id: "m1", content: "fact 1", scope: "agent", state: "active" }],
        total: 1,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ injectionStrategy: "session_start" }),
      );
      await middleware.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext(1);
      await middleware.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata).toHaveProperty("memories");
      expect((turnCtx.metadata as Record<string, unknown>).memories).toHaveLength(1);
    });

    it("should not re-query with session_start strategy", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ injectionStrategy: "session_start" }),
      );
      await middleware.onSessionStart(createSessionContext());
      mockClient.mockMemory.query.mockClear();

      await middleware.onBeforeTurn(createTurnContext(1));

      // Should NOT call query again
      expect(mockClient.mockMemory.query).not.toHaveBeenCalled();
    });

    it("should re-query on every turn with every_turn strategy", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [{ memory_id: "m1", content: "fresh data", scope: "agent", state: "active" }],
        total: 1,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ injectionStrategy: "every_turn" }),
      );
      await middleware.onSessionStart(createSessionContext());
      mockClient.mockMemory.query.mockClear();

      mockClient.mockMemory.query.mockResolvedValue({
        results: [{ memory_id: "m2", content: "updated data", scope: "agent", state: "active" }],
        total: 1,
        filters: {},
      });

      await middleware.onBeforeTurn(createTurnContext(1));
      expect(mockClient.mockMemory.query).toHaveBeenCalledTimes(1);
    });

    it("should not inject with on_demand strategy", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [{ memory_id: "m1", content: "fact 1", scope: "agent", state: "active" }],
        total: 1,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ injectionStrategy: "on_demand" }),
      );
      await middleware.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext(1);
      await middleware.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata).toBeUndefined();
    });

    it("should not inject when no memories loaded", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const turnCtx = createTurnContext(1);
      await middleware.onBeforeTurn(turnCtx);

      // No memories to inject, metadata should be unchanged
      expect(turnCtx.metadata).toBeUndefined();
    });
  });

  describe("onAfterTurn", () => {
    it("should accumulate facts without flushing before interval", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 5 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 4 turns — should NOT flush yet
      for (let i = 1; i <= 4; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should flush on autoSaveInterval", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 5, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 5 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 5 turns — should flush
      for (let i = 1; i <= 5; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([
          expect.objectContaining({ scope: "agent", memory_type: "experience" }),
        ]),
      });
    });

    it("should flush twice over 10 turns with interval 5", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 5, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 5 }),
      );
      await middleware.onSessionStart(createSessionContext());

      for (let i = 1; i <= 10; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(2);
    });

    it("should flush every turn with interval 1", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      for (let i = 1; i <= 3; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(3);
    });

    it("should not flush with large interval in short session", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 100 }),
      );
      await middleware.onSessionStart(createSessionContext());

      for (let i = 1; i <= 50; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should skip short outputs", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 0, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onAfterTurn(createTurnContext(1, { output: "ok" }));

      // "ok" is too short, no batchStore should be called
      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should skip null/undefined outputs", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onAfterTurn(createTurnContext(1, { output: null }));
      await middleware.onAfterTurn(createTurnContext(2, { output: undefined }));

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should include namespace in extracted facts when configured", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ namespace: "test-ns", autoSaveInterval: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([expect.objectContaining({ namespace: "test-ns" })]),
      });
    });
  });

  describe("onAfterTurn error recovery (Decision 12A)", () => {
    it("should retain buffer on batchStore failure", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockRejectedValueOnce(new Error("API error"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 5 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 5 turns — flush attempt fails
      for (let i = 1; i <= 5; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("batch store failed"),
        expect.any(String),
      );
    });

    it("should retry on next interval after failure", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      // First flush fails, second succeeds
      mockClient.mockMemory.batchStore
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce({ stored: 10, failed: 0, memory_ids: [] });
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 5 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 10 turns — first flush fails at 5, second succeeds at 10
      for (let i = 1; i <= 10; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(2);
      // Second call should include retained memories from first failure + new ones
    });
  });

  describe("onSessionEnd", () => {
    it("should flush remaining pending memories", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });
      mockClient.mockMemory.store.mockResolvedValue({ memory_id: "distill-1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 10 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 3 turns — below flush interval
      for (let i = 1; i <= 3; i++) {
        await middleware.onAfterTurn(createTurnContext(i));
      }
      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();

      await middleware.onSessionEnd(createSessionContext());

      // Should have flushed on end
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
    });

    it("should store session distillation", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.store.mockResolvedValue({ memory_id: "distill-1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());
      await middleware.onSessionEnd(createSessionContext());

      expect(mockClient.mockMemory.store).toHaveBeenCalledWith(
        expect.objectContaining({
          memory_type: "experience",
          importance: 0.7,
          metadata: expect.objectContaining({
            type: "session_distillation",
            session_id: "test-session-1",
          }),
        }),
      );
    });

    it("should handle distillation timeout gracefully", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.store.mockImplementation(() => new Promise(() => {})); // never resolves

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ distillationTimeoutMs: 50 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Should not block indefinitely
      await expect(middleware.onSessionEnd(createSessionContext())).resolves.toBeUndefined();
    });

    it("should handle both flush and distillation failure gracefully", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockRejectedValue(new Error("Batch error"));
      mockClient.mockMemory.store.mockRejectedValue(new Error("Store error"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 10 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onAfterTurn(createTurnContext(1));
      await expect(middleware.onSessionEnd(createSessionContext())).resolves.toBeUndefined();
    });

    it("should not flush if no pending memories", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      // No turns → no pending memories
      await middleware.onSessionEnd(createSessionContext());

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });
  });

  describe("validateMemoryConfig", () => {
    it("should accept valid config", () => {
      expect(() => validateMemoryConfig(createConfig())).not.toThrow();
    });

    it("should accept config with all options", () => {
      expect(() =>
        validateMemoryConfig(
          createConfig({
            autoSaveInterval: 3,
            maxMemoriesPerQuery: 20,
            injectionStrategy: "every_turn",
            sessionStartTimeoutMs: 5000,
            distillationTimeoutMs: 15000,
            namespace: "my-ns",
          }),
        ),
      ).not.toThrow();
    });

    it("should reject invalid scope", () => {
      expect(() =>
        validateMemoryConfig({ scope: "invalid" as NexusMemoryConfig["scope"] }),
      ).toThrow(MemoryConfigurationError);
    });

    it("should reject negative autoSaveInterval", () => {
      expect(() => validateMemoryConfig(createConfig({ autoSaveInterval: -1 }))).toThrow(
        MemoryConfigurationError,
      );
    });

    it("should reject zero autoSaveInterval", () => {
      expect(() => validateMemoryConfig(createConfig({ autoSaveInterval: 0 }))).toThrow(
        MemoryConfigurationError,
      );
    });

    it("should reject negative maxMemoriesPerQuery", () => {
      expect(() => validateMemoryConfig(createConfig({ maxMemoriesPerQuery: -1 }))).toThrow(
        MemoryConfigurationError,
      );
    });

    it("should reject negative sessionStartTimeoutMs", () => {
      expect(() => validateMemoryConfig(createConfig({ sessionStartTimeoutMs: -1 }))).toThrow(
        MemoryConfigurationError,
      );
    });

    it("should reject negative distillationTimeoutMs", () => {
      expect(() => validateMemoryConfig(createConfig({ distillationTimeoutMs: -1 }))).toThrow(
        MemoryConfigurationError,
      );
    });
  });
});
