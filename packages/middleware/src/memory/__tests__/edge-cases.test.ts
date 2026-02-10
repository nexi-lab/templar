import type { NexusClient } from "@nexus/sdk";
import { MemoryConfigurationError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNexusMemoryMiddleware } from "../index.js";
import { NexusMemoryMiddleware } from "../middleware.js";
import type { NexusMemoryConfig } from "../types.js";

function createMockClient() {
  const mockMemory = {
    store: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    search: vi.fn(),
    batchStore: vi.fn(),
    delete: vi.fn(),
  };

  const client = {
    memory: mockMemory,
    agents: {},
    tools: {},
    channels: {},
    withRetry: () => client,
    withTimeout: () => client,
  } as unknown as NexusClient;

  return { client, mockMemory };
}

describe("Edge cases", () => {
  let mock: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mock = createMockClient();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("factory function", () => {
    it("should create middleware with valid config", () => {
      const middleware = createNexusMemoryMiddleware(mock.client, { scope: "agent" });
      expect(middleware).toBeInstanceOf(NexusMemoryMiddleware);
      expect(middleware.name).toBe("nexus-memory");
    });

    it("should reject invalid scope via factory", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, {
          scope: "bad" as NexusMemoryConfig["scope"],
        }),
      ).toThrow(MemoryConfigurationError);
    });

    it("should reject invalid autoSaveInterval via factory", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, { scope: "agent", autoSaveInterval: 0 }),
      ).toThrow(MemoryConfigurationError);
    });
  });

  describe("zero-config defaults", () => {
    it("should work with only scope provided", async () => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(mock.client, { scope: "agent" });

      await middleware.onSessionStart({ sessionId: "s1" });
      await middleware.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: "A sufficiently long response for extraction.",
      });
      await middleware.onSessionEnd({ sessionId: "s1" });

      expect(mock.mockMemory.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("empty conversation", () => {
    it("should handle start → immediately end", async () => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(mock.client, { scope: "agent" });

      await middleware.onSessionStart({ sessionId: "s1" });
      await middleware.onSessionEnd({ sessionId: "s1" });

      // No batchStore (no turns)
      expect(mock.mockMemory.batchStore).not.toHaveBeenCalled();
      // Distillation should still be stored
      expect(mock.mockMemory.store).toHaveBeenCalledTimes(1);
      expect(mock.mockMemory.store).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ turn_count: 0 }),
        }),
      );
    });
  });

  describe("single turn conversation", () => {
    it("should handle start → 1 turn → end", async () => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mock.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });
      mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

      const middleware = new NexusMemoryMiddleware(mock.client, {
        scope: "agent",
        autoSaveInterval: 5,
      });

      await middleware.onSessionStart({ sessionId: "s1" });
      await middleware.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: "This is a single turn response with enough content.",
      });
      await middleware.onSessionEnd({ sessionId: "s1" });

      // Pending memory should be flushed at session end
      expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      expect(mock.mockMemory.store).toHaveBeenCalledTimes(1);
    });
  });

  describe("large content", () => {
    it("should handle very large output without crashing", async () => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mock.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(mock.client, {
        scope: "agent",
        autoSaveInterval: 1,
      });

      await middleware.onSessionStart({ sessionId: "s1" });

      const largeOutput = "x".repeat(100_000);
      await middleware.onAfterTurn({ sessionId: "s1", turnNumber: 1, output: largeOutput });

      expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(1);
    });

    it("should handle object output", async () => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
      mock.mockMemory.batchStore.mockResolvedValue({ stored: 1, failed: 0, memory_ids: [] });

      const middleware = new NexusMemoryMiddleware(mock.client, {
        scope: "agent",
        autoSaveInterval: 1,
      });

      await middleware.onSessionStart({ sessionId: "s1" });

      const objectOutput = { result: "some data", details: { key: "value", nested: [1, 2, 3] } };
      await middleware.onAfterTurn({ sessionId: "s1", turnNumber: 1, output: objectOutput });

      expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(1);
      expect(mock.mockMemory.batchStore).toHaveBeenCalledWith({
        memories: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("some data"),
          }),
        ]),
      });
    });
  });

  describe("scope values", () => {
    const validScopes: NexusMemoryConfig["scope"][] = [
      "agent",
      "user",
      "zone",
      "global",
      "session",
    ];

    it.each(validScopes)("should accept scope '%s'", async (scope) => {
      mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });

      const middleware = new NexusMemoryMiddleware(mock.client, { scope });
      await middleware.onSessionStart({ sessionId: "s1" });

      expect(mock.mockMemory.query).toHaveBeenCalledWith(expect.objectContaining({ scope }));
    });
  });

  describe("config validation edge cases", () => {
    it("should accept autoSaveInterval of 1", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, { scope: "agent", autoSaveInterval: 1 }),
      ).not.toThrow();
    });

    it("should accept very large autoSaveInterval", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, { scope: "agent", autoSaveInterval: 1_000_000 }),
      ).not.toThrow();
    });

    it("should accept zero timeout", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, { scope: "agent", sessionStartTimeoutMs: 0 }),
      ).not.toThrow();
    });

    it("should accept maxMemoriesPerQuery of 1", () => {
      expect(() =>
        createNexusMemoryMiddleware(mock.client, { scope: "agent", maxMemoriesPerQuery: 1 }),
      ).not.toThrow();
    });
  });
});
