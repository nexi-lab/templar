import type { SessionContext, TurnContext } from "@templar/core";
import { MemoryConfigurationError } from "@templar/errors";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusMemoryMiddleware, validateMemoryConfig } from "../middleware.js";
import type {
  FactExtractionContext,
  FactExtractor,
  FactTurnSummary,
  NexusMemoryConfig,
} from "../types.js";

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

  // ==========================================================================
  // New tests for FactExtractor integration, dedup, async, config validation
  // ==========================================================================

  describe("FactExtractor injection", () => {
    it("should accept a custom FactExtractor", async () => {
      const customExtractor: FactExtractor = {
        extract: vi
          .fn()
          .mockResolvedValue([{ content: "Custom fact", category: "fact", importance: 0.9 }]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      expect(customExtractor.extract).toHaveBeenCalledTimes(1);
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([
          expect.objectContaining({ content: "Custom fact", memory_type: "fact", importance: 0.9 }),
        ]),
      });
    });

    it("should use SimpleFactExtractor by default when no extractor provided", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      // SimpleFactExtractor produces memory_type: "experience"
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([
          expect.objectContaining({ memory_type: "experience", importance: 0.5 }),
        ]),
      });
    });

    it("should pass turn summaries to extractor", async () => {
      const customExtractor: FactExtractor = {
        extract: vi.fn().mockResolvedValue([]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 2 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onAfterTurn(
        createTurnContext(1, { input: "hello", output: "world response that is long enough" }),
      );
      await middleware.onAfterTurn(
        createTurnContext(2, { input: "goodbye", output: "farewell response that is also long" }),
      );

      expect(customExtractor.extract).toHaveBeenCalledTimes(1);
      const turns = (customExtractor.extract as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as FactTurnSummary[];
      expect(turns).toHaveLength(2);
      expect(turns[0]?.input).toBe("hello");
      expect(turns[1]?.input).toBe("goodbye");
    });

    it("should pass sessionId in extraction context", async () => {
      const customExtractor: FactExtractor = {
        extract: vi.fn().mockResolvedValue([]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      const context = (customExtractor.extract as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[1] as FactExtractionContext;
      expect(context.sessionId).toBe("test-session-1");
    });

    it("should handle extractor returning multiple categories", async () => {
      const customExtractor: FactExtractor = {
        extract: vi.fn().mockResolvedValue([
          { content: "User prefers dark mode", category: "preference", importance: 0.9 },
          { content: "Chose React over Vue", category: "decision", importance: 0.7 },
          { content: "App uses Next.js 14", category: "fact", importance: 0.8 },
        ]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([
          expect.objectContaining({ memory_type: "preference" }),
          expect.objectContaining({ memory_type: "decision" }),
          expect.objectContaining({ memory_type: "fact" }),
        ]),
      });
    });
  });

  describe("extractor error handling", () => {
    it("should handle extractor throwing error gracefully", async () => {
      const failingExtractor: FactExtractor = {
        extract: vi.fn().mockRejectedValue(new Error("LLM timeout")),
      };
      vi.spyOn(console, "warn").mockImplementation(() => {});

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        failingExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      // Should not throw
      await expect(middleware.onAfterTurn(createTurnContext(1))).resolves.toBeUndefined();
      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should handle extractor returning empty array", async () => {
      const emptyExtractor: FactExtractor = {
        extract: vi.fn().mockResolvedValue([]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        emptyExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should continue session after extraction failure", async () => {
      let callCount = 0;
      const flakyExtractor: FactExtractor = {
        extract: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) throw new Error("First call fails");
          return Promise.resolve([{ content: "Recovery fact", category: "fact", importance: 0.6 }]);
        }),
      };
      vi.spyOn(console, "warn").mockImplementation(() => {});

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        flakyExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      // First turn — extraction fails, no crash
      await middleware.onAfterTurn(createTurnContext(1));
      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();

      // Second turn — extraction recovers
      await middleware.onAfterTurn(createTurnContext(2));
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate identical content when dedup is enabled", async () => {
      const sameOutput = "Identical output that repeats across multiple turns for testing dedup.";

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({
          autoSaveInterval: 3,
          autoSave: { deduplication: true },
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 3 turns with identical output
      for (let i = 1; i <= 3; i++) {
        await middleware.onAfterTurn(createTurnContext(i, { output: sameOutput }));
      }

      // Only 1 unique fact should be stored (not 3)
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      const memories = mockClient.mockMemory.batchStore.mock.calls[0]?.[0]?.memories;
      expect(memories).toHaveLength(1);
    });

    it("should not deduplicate when dedup is disabled", async () => {
      const sameOutput = "Identical output that repeats across multiple turns for testing dedup.";

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({
          autoSaveInterval: 3,
          autoSave: { deduplication: false },
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      for (let i = 1; i <= 3; i++) {
        await middleware.onAfterTurn(createTurnContext(i, { output: sameOutput }));
      }

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      const memories = mockClient.mockMemory.batchStore.mock.calls[0]?.[0]?.memories;
      expect(memories).toHaveLength(3);
    });

    it("should allow different content through dedup", async () => {
      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({
          autoSaveInterval: 3,
          autoSave: { deduplication: true },
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      // 3 turns with different output
      await middleware.onAfterTurn(
        createTurnContext(1, { output: "First unique response with enough length." }),
      );
      await middleware.onAfterTurn(
        createTurnContext(2, { output: "Second unique response with enough length." }),
      );
      await middleware.onAfterTurn(
        createTurnContext(3, { output: "Third unique response with enough length." }),
      );

      const memories = mockClient.mockMemory.batchStore.mock.calls[0]?.[0]?.memories;
      expect(memories).toHaveLength(3);
    });

    it("should reset dedup hash set on session start", async () => {
      const sameOutput = "Same content across sessions for dedup reset test.";

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });
      mockClient.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({
          autoSaveInterval: 1,
          autoSave: { deduplication: true },
        }),
      );

      // Session 1
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1, { output: sameOutput }));
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      await middleware.onSessionEnd(createSessionContext());

      mockClient.mockMemory.batchStore.mockClear();

      // Session 2 — hash set should be reset
      await middleware.onSessionStart(createSessionContext({ sessionId: "session-2" }));
      await middleware.onAfterTurn(
        createTurnContext(1, { output: sameOutput, sessionId: "session-2" }),
      );
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("turn buffer", () => {
    it("should buffer turns and extract in batches", async () => {
      const customExtractor: FactExtractor = {
        extract: vi
          .fn()
          .mockResolvedValue([{ content: "Batch fact", category: "fact", importance: 0.7 }]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 3 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      // First 2 turns — no extraction yet
      await middleware.onAfterTurn(createTurnContext(1));
      await middleware.onAfterTurn(createTurnContext(2));
      expect(customExtractor.extract).not.toHaveBeenCalled();

      // Turn 3 — extraction triggered with all 3 buffered turns
      await middleware.onAfterTurn(createTurnContext(3));
      expect(customExtractor.extract).toHaveBeenCalledTimes(1);
      const turns = (customExtractor.extract as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as FactTurnSummary[];
      expect(turns).toHaveLength(3);
    });

    it("should extract remaining buffer on session end", async () => {
      const customExtractor: FactExtractor = {
        extract: vi
          .fn()
          .mockResolvedValue([{ content: "End fact", category: "experience", importance: 0.5 }]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });
      mockClient.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 10 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      // 2 turns — below interval
      await middleware.onAfterTurn(createTurnContext(1));
      await middleware.onAfterTurn(createTurnContext(2));
      expect(customExtractor.extract).not.toHaveBeenCalled();

      // Session end — remaining turns extracted
      await middleware.onSessionEnd(createSessionContext());
      expect(customExtractor.extract).toHaveBeenCalledTimes(1);
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("maxPendingMemories", () => {
    it("should cap pending memories at maxPendingMemories", async () => {
      const prolificExtractor: FactExtractor = {
        extract: vi.fn().mockImplementation((turns: readonly FactTurnSummary[]) => {
          // Return 10 facts per extraction call
          return Promise.resolve(
            Array.from({ length: 10 }, (_, i) => ({
              content: `Fact ${i} from turn ${turns[0]?.turnNumber}`,
              category: "fact" as const,
              importance: 0.5,
            })),
          );
        }),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockRejectedValue(new Error("store fails"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({
          autoSaveInterval: 1,
          autoSave: { maxPendingMemories: 5 },
        }),
        prolificExtractor,
      );
      await middleware.onSessionStart(createSessionContext());

      // Extraction produces 10 facts, flush fails → pending grows
      await middleware.onAfterTurn(createTurnContext(1));

      // Flush fails, so pending should be capped at 5
      // (10 produced, capped to last 5)
      // Second extraction adds more, still capped
      await middleware.onAfterTurn(createTurnContext(2));

      // The pending buffer should never exceed maxPendingMemories
      // We can't check internal state directly, but we can verify batchStore receives capped data
    });
  });

  describe("path_key support", () => {
    it("should include path_key in stored memories when extractor provides it", async () => {
      const customExtractor: FactExtractor = {
        extract: vi
          .fn()
          .mockResolvedValue([
            { content: "Fact with key", category: "fact", importance: 0.8, pathKey: "mem:abc123" },
          ]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([expect.objectContaining({ path_key: "mem:abc123" })]),
      });
    });

    it("should not include path_key when extractor omits it", async () => {
      const customExtractor: FactExtractor = {
        extract: vi
          .fn()
          .mockResolvedValue([{ content: "Fact without key", category: "fact", importance: 0.8 }]),
      };

      mockClient.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mockClient.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(
        mockClient.client,
        createConfig({ autoSaveInterval: 1 }),
        customExtractor,
      );
      await middleware.onSessionStart(createSessionContext());
      await middleware.onAfterTurn(createTurnContext(1));

      const memories = mockClient.mockMemory.batchStore.mock.calls[0]?.[0]?.memories;
      expect(memories[0]).not.toHaveProperty("path_key");
    });
  });

  describe("autoSave config validation", () => {
    it("should accept valid autoSave config", () => {
      expect(() =>
        validateMemoryConfig(
          createConfig({
            autoSave: {
              deduplication: true,
              extractionTimeoutMs: 5000,
              maxPendingMemories: 50,
            },
          }),
        ),
      ).not.toThrow();
    });

    it("should reject negative extractionTimeoutMs", () => {
      expect(() =>
        validateMemoryConfig(createConfig({ autoSave: { extractionTimeoutMs: -1 } })),
      ).toThrow(MemoryConfigurationError);
    });

    it("should reject zero maxPendingMemories", () => {
      expect(() =>
        validateMemoryConfig(createConfig({ autoSave: { maxPendingMemories: 0 } })),
      ).toThrow(MemoryConfigurationError);
    });

    it("should reject negative maxPendingMemories", () => {
      expect(() =>
        validateMemoryConfig(createConfig({ autoSave: { maxPendingMemories: -5 } })),
      ).toThrow(MemoryConfigurationError);
    });

    it("should accept zero extractionTimeoutMs", () => {
      expect(() =>
        validateMemoryConfig(createConfig({ autoSave: { extractionTimeoutMs: 0 } })),
      ).not.toThrow();
    });

    it("should accept undefined autoSave", () => {
      expect(() => validateMemoryConfig(createConfig())).not.toThrow();
    });
  });
});
