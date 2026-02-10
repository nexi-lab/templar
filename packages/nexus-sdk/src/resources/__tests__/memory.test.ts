import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import type {
  BatchStoreMemoriesResponse,
  DeleteMemoryResponse,
  MemoryStoreResponse,
  MemoryWithHistory,
  QueryMemoriesResponse,
  SearchMemoriesResponse,
} from "../../types/memory.js";

describe("MemoryResource", () => {
  let originalFetch: typeof global.fetch;
  let client: NexusClient;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new NexusClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(data: unknown, status = 200): void {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  function mockFetchError(errorBody: unknown, status: number): void {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(errorBody), { status }));
  }

  // =========================================================================
  // store()
  // =========================================================================

  describe("store", () => {
    const mockResponse: MemoryStoreResponse = {
      memory_id: "mem-123",
      status: "created",
    };

    it("should store a memory with minimal params", async () => {
      mockFetchResponse(mockResponse, 201);

      const result = await client.memory.store({
        content: "User prefers TypeScript",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "User prefers TypeScript" }),
        }),
      );
    });

    it("should store a memory with full params", async () => {
      mockFetchResponse(mockResponse, 201);

      const params = {
        content: "User prefers TypeScript",
        scope: "agent" as const,
        memory_type: "preference",
        importance: 0.8,
        namespace: "dev/prefs",
        path_key: "lang-pref",
        state: "active" as const,
        extract_entities: true,
        extract_temporal: false,
        extract_relationships: false,
        store_to_graph: false,
        valid_at: "2024-01-01T00:00:00Z",
        metadata: { source: "conversation" },
      };

      await client.memory.store(params);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(params),
        }),
      );
    });

    it("should store structured content", async () => {
      mockFetchResponse(mockResponse, 201);

      await client.memory.store({
        content: { key: "value", nested: { data: true } },
        scope: "user",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories",
        expect.objectContaining({
          body: JSON.stringify({
            content: { key: "value", nested: { data: true } },
            scope: "user",
          }),
        }),
      );
    });

    it("should propagate API errors", async () => {
      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });
      mockFetchError({ code: "INTERNAL_ERROR", message: "Store failed" }, 500);

      await expect(singleRetryClient.memory.store({ content: "test" })).rejects.toThrow();
    });

    it.each([
      "agent",
      "user",
      "zone",
      "global",
      "session",
    ] as const)("should accept scope '%s'", async (scope) => {
      mockFetchResponse(mockResponse, 201);
      await client.memory.store({ content: "test", scope });
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // get()
  // =========================================================================

  describe("get", () => {
    const mockMemory: MemoryWithHistory = {
      memory: {
        memory_id: "mem-123",
        content: "User prefers TypeScript",
        scope: "agent",
        state: "active",
        importance: 0.8,
      },
    };

    it("should get a memory by ID", async () => {
      mockFetchResponse(mockMemory);

      const result = await client.memory.get("mem-123");

      expect(result).toEqual(mockMemory);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/mem-123",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should include include_history query param", async () => {
      mockFetchResponse({ ...mockMemory, versions: [] });

      await client.memory.get("mem-123", { include_history: true });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/mem-123?include_history=true",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should include track_access query param", async () => {
      mockFetchResponse(mockMemory);

      await client.memory.get("mem-123", { track_access: false });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/mem-123?track_access=false",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should include both query params", async () => {
      mockFetchResponse(mockMemory);

      await client.memory.get("mem-123", { include_history: true, track_access: false });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("include_history=true");
      expect(calledUrl).toContain("track_access=false");
    });

    it("should handle 404 errors", async () => {
      mockFetchError({ code: "NOT_FOUND", message: "Memory not found: mem-999" }, 404);

      await expect(client.memory.get("mem-999")).rejects.toThrow("Memory not found");
    });
  });

  // =========================================================================
  // query()
  // =========================================================================

  describe("query", () => {
    const mockResponse: QueryMemoriesResponse = {
      results: [
        {
          memory_id: "mem-1",
          content: "Fact 1",
          scope: "agent",
          state: "active",
        },
      ],
      total: 1,
      filters: { scope: "agent" },
    };

    it("should query with minimal filters", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.memory.query({ scope: "agent" });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/query",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ scope: "agent" }),
        }),
      );
    });

    it("should query with full filters", async () => {
      mockFetchResponse(mockResponse);

      const params = {
        scope: "agent",
        memory_type: "fact",
        namespace: "dev",
        namespace_prefix: "dev/",
        state: "active",
        limit: 10,
        after: "2024-01-01T00:00:00Z",
        before: "2024-12-31T23:59:59Z",
        include_invalid: false,
        include_superseded: false,
        as_of_event: "2024-06-15T12:00:00Z",
      };

      await client.memory.query(params);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/query",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(params),
        }),
      );
    });

    it("should handle empty results", async () => {
      mockFetchResponse({ results: [], total: 0, filters: {} });

      const result = await client.memory.query({ scope: "user" });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // =========================================================================
  // search()
  // =========================================================================

  describe("search", () => {
    const mockResponse: SearchMemoriesResponse = {
      results: [
        {
          memory_id: "mem-1",
          content: "User prefers TypeScript",
          scope: "agent",
          state: "active",
        },
      ],
      total: 1,
      query: "programming preferences",
      search_mode: "hybrid",
    };

    it("should search with query string", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.memory.search({
        query: "programming preferences",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/search",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ query: "programming preferences" }),
        }),
      );
    });

    it.each([
      "semantic",
      "keyword",
      "hybrid",
    ] as const)("should search with mode '%s'", async (search_mode) => {
      mockFetchResponse({ ...mockResponse, search_mode });

      await client.memory.search({
        query: "test",
        search_mode,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/search",
        expect.objectContaining({
          body: JSON.stringify({ query: "test", search_mode }),
        }),
      );
    });

    it("should search with all filters", async () => {
      mockFetchResponse(mockResponse);

      await client.memory.search({
        query: "test",
        scope: "user",
        memory_type: "preference",
        limit: 5,
        search_mode: "semantic",
        after: "2024-01-01T00:00:00Z",
        person: "Alice",
      });

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // batchStore()
  // =========================================================================

  describe("batchStore", () => {
    const mockResponse: BatchStoreMemoriesResponse = {
      stored: 2,
      failed: 0,
      memory_ids: ["mem-1", "mem-2"],
    };

    it("should batch store memories", async () => {
      mockFetchResponse(mockResponse, 201);

      const result = await client.memory.batchStore({
        memories: [
          { content: "Fact 1", scope: "agent", memory_type: "fact" },
          { content: "Fact 2", scope: "agent", memory_type: "fact" },
        ],
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/batch",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should handle partial failures", async () => {
      const partialResponse: BatchStoreMemoriesResponse = {
        stored: 1,
        failed: 1,
        memory_ids: ["mem-1"],
        errors: [{ index: 1, error: "Invalid content" }],
      };
      mockFetchResponse(partialResponse, 201);

      const result = await client.memory.batchStore({
        memories: [{ content: "Good fact" }, { content: "" }],
      });

      expect(result.stored).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("should handle empty batch", async () => {
      mockFetchResponse({ stored: 0, failed: 0, memory_ids: [] }, 201);

      const result = await client.memory.batchStore({ memories: [] });

      expect(result.stored).toBe(0);
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe("delete", () => {
    const mockResponse: DeleteMemoryResponse = {
      deleted: true,
      memory_id: "mem-123",
      soft: true,
    };

    it("should soft delete by default", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.memory.delete("mem-123");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/mem-123",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should pass soft=false query param", async () => {
      mockFetchResponse({ ...mockResponse, soft: false });

      await client.memory.delete("mem-123", { soft: false });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/memories/mem-123?soft=false",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should handle 404 on delete", async () => {
      mockFetchError({ code: "NOT_FOUND", message: "Memory not found: mem-999" }, 404);

      await expect(client.memory.delete("mem-999")).rejects.toThrow("Memory not found");
    });
  });

  // =========================================================================
  // Error handling (cross-cutting)
  // =========================================================================

  describe("error handling", () => {
    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(client.memory.store({ content: "test" })).rejects.toThrow("Network error");
    });

    it("should handle timeout errors", async () => {
      const timeoutClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        timeout: 10,
        retry: { maxAttempts: 1 },
      });

      global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        // Simulate a slow response that will be aborted
        return new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
        });
      });

      await expect(timeoutClient.memory.search({ query: "test" })).rejects.toThrow();
    });

    it("should handle 500 server errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Server error" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(singleRetryClient.memory.query({ scope: "agent" })).rejects.toThrow(
        "Server error",
      );
    });
  });
});
