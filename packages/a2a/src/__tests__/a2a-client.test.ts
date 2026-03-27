import {
  A2aAuthFailedError,
  A2aDiscoveryFailedError,
  A2aTaskFailedError,
  A2aTaskRejectedError,
  A2aUnsupportedOperationError,
} from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A2AClient } from "../a2a-client.js";
import {
  createJsonRpcError,
  createJsonRpcSuccess,
  createRawAgentCard,
  createRawTaskResult,
  mockFetchResponse,
} from "./helpers.js";

describe("A2AClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // =========================================================================
  // Discovery
  // =========================================================================

  describe("discover", () => {
    it("fetches and normalizes an Agent Card", async () => {
      const rawCard = createRawAgentCard();
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

      const client = new A2AClient();
      const card = await client.discover("https://agent.example.com");

      expect(card.name).toBe("Test Agent");
      expect(card.url).toBe("https://agent.example.com");
      expect(card.skills).toHaveLength(1);
      expect(card.skills[0]?.id).toBe("search");
      expect(card.capabilities.streaming).toBe(false);
      expect(card.provider).toBe("Test Corp");

      // Verify correct URL was fetched
      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(fetchCall?.[0]).toBe("https://agent.example.com/.well-known/agent.json");
    });

    it("caches Agent Card on second call", async () => {
      const rawCard = createRawAgentCard();
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

      const client = new A2AClient();
      const card1 = await client.discover("https://agent.example.com");
      const card2 = await client.discover("https://agent.example.com");

      expect(card1).toEqual(card2);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    });

    // Edge case 1: Agent Card URL returns 404
    it("throws A2aDiscoveryFailedError on 404", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse("Not Found", 404, false));

      const client = new A2AClient();
      await expect(client.discover("https://missing.com")).rejects.toThrow(A2aDiscoveryFailedError);
    });

    // Edge case 2: Agent Card URL returns invalid JSON
    it("throws A2aDiscoveryFailedError on invalid JSON", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        text: () => Promise.resolve("not json"),
        headers: new Headers(),
      } as Response);

      const client = new A2AClient();
      await expect(client.discover("https://bad-json.com")).rejects.toThrow(
        A2aDiscoveryFailedError,
      );
    });

    // Edge case 3: Agent Card URL timeout
    it("throws A2aDiscoveryFailedError on timeout", async () => {
      vi.useRealTimers();
      // Mock fetch that respects abort signal
      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const onAbort = () =>
              reject(new DOMException("The operation was aborted.", "AbortError"));
            if (init?.signal?.aborted) {
              onAbort();
              return;
            }
            init?.signal?.addEventListener("abort", onAbort, { once: true });
          }),
      );

      const client = new A2AClient({ discoveryTimeoutMs: 500 });
      await expect(client.discover("https://slow.com")).rejects.toThrow(A2aDiscoveryFailedError);
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    // Edge case 4: Cache expiry triggers re-fetch
    it("re-fetches when cache entry expires", async () => {
      const rawCard = createRawAgentCard();
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

      const client = new A2AClient({ cacheTtlMs: 1000 });
      await client.discover("https://agent.com");

      // Expire cache
      vi.advanceTimersByTime(1001);

      await client.discover("https://agent.com");
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    });

    it("throws A2aDiscoveryFailedError for empty URL", async () => {
      const client = new A2AClient();
      await expect(client.discover("")).rejects.toThrow(A2aDiscoveryFailedError);
    });

    // Edge case 11: Auth header sent for protected agents
    it("throws A2aAuthFailedError on 401", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse("Unauthorized", 401, false));

      const client = new A2AClient();
      await expect(client.discover("https://protected.com")).rejects.toThrow(A2aAuthFailedError);
    });
  });

  // =========================================================================
  // Send Message
  // =========================================================================

  describe("sendMessage", () => {
    // Edge case 5: Immediate COMPLETED
    it("returns immediately on COMPLETED task", async () => {
      const taskResult = createRawTaskResult("completed");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const client = new A2AClient();
      const result = await client.sendMessage("https://agent.com", "Hello");

      expect(result.state).toBe("completed");
      expect(result.taskId).toBe("task-123");
    });

    // Edge case 7: REJECTED task
    it("throws A2aTaskRejectedError on REJECTED state", async () => {
      const taskResult = createRawTaskResult("rejected");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const client = new A2AClient();
      await expect(client.sendMessage("https://agent.com", "Bad request")).rejects.toThrow(
        A2aTaskRejectedError,
      );
    });

    // Edge case 8: FAILED task
    it("throws A2aTaskFailedError on FAILED state", async () => {
      const taskResult = createRawTaskResult("failed");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const client = new A2AClient();
      await expect(client.sendMessage("https://agent.com", "Fail")).rejects.toThrow(
        A2aTaskFailedError,
      );
    });

    // Edge case 9: INPUT_REQUIRED returns for LLM handling
    it("returns INPUT_REQUIRED state for LLM handling", async () => {
      // First call returns WORKING, second returns INPUT_REQUIRED
      const workingResult = createRawTaskResult("working");
      const inputResult = createRawTaskResult("input_required");

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(createJsonRpcSuccess(workingResult)))
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(inputResult)));

      const client = new A2AClient({
        pollIntervalMs: 100,
        taskTimeoutMs: 5_000,
      });
      const result = await client.sendMessage("https://agent.com", "Need info");

      expect(result.state).toBe("input_required");
    });

    it("throws A2aAuthFailedError on 401", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse("Unauthorized", 401, false));

      const client = new A2AClient();
      await expect(client.sendMessage("https://agent.com", "Hi")).rejects.toThrow(
        A2aAuthFailedError,
      );
    });

    it("handles JSON-RPC error response", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcError(-32002, "Not supported")));

      const client = new A2AClient();
      await expect(client.sendMessage("https://agent.com", "Hi")).rejects.toThrow(
        A2aUnsupportedOperationError,
      );
    });

    it("includes auth headers when configured", async () => {
      const taskResult = createRawTaskResult("completed");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const authMap = new Map([
        ["https://agent.com", { type: "bearer" as const, credentials: "my-token" }],
      ]);
      const client = new A2AClient({}, authMap);
      await client.sendMessage("https://agent.com", "Hi");

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = (fetchCall?.[1] as RequestInit)?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe("Bearer my-token");
    });
  });

  // =========================================================================
  // Get Task
  // =========================================================================

  describe("getTask", () => {
    // Edge case 10: Invalid task ID
    it("throws on JSON-RPC error for invalid task", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcError(-32001, "Task not found")));

      const client = new A2AClient();
      await expect(client.getTask("https://agent.com", "bad-id")).rejects.toThrow(
        A2aTaskRejectedError,
      );
    });

    it("returns task state", async () => {
      const taskResult = createRawTaskResult("working");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const client = new A2AClient();
      const result = await client.getTask("https://agent.com", "task-123");

      expect(result.state).toBe("working");
      expect(result.taskId).toBe("task-123");
    });
  });

  // =========================================================================
  // Cancel Task
  // =========================================================================

  describe("cancelTask", () => {
    it("returns canceled task state", async () => {
      const taskResult = createRawTaskResult("canceled");
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

      const client = new A2AClient();
      const result = await client.cancelTask("https://agent.com", "task-123");

      // cancelTask calls normalizeTaskResult, but does NOT go through
      // handleTerminalState for 'canceled', so it should just return
      expect(result.state).toBe("canceled");
    });
  });

  // =========================================================================
  // Polling (Edge case 6)
  // =========================================================================

  describe("polling", () => {
    it("polls until COMPLETED when task is WORKING", async () => {
      const workingResult = createRawTaskResult("working");
      const completedResult = createRawTaskResult("completed");

      // First call: send message → WORKING
      // Second call: get task → still WORKING
      // Third call: get task → COMPLETED
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(createJsonRpcSuccess(workingResult)))
        .mockResolvedValueOnce(mockFetchResponse(createJsonRpcSuccess(workingResult)))
        .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(completedResult)));

      const client = new A2AClient({
        pollIntervalMs: 100,
        taskTimeoutMs: 10_000,
      });
      const result = await client.sendMessage("https://agent.com", "Work on this");

      expect(result.state).toBe("completed");
      // send + 2 polls
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Cache Management
  // =========================================================================

  describe("cache management", () => {
    it("clearCache empties all entries", async () => {
      const rawCard = createRawAgentCard();
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

      const client = new A2AClient();
      await client.discover("https://agent.com");

      client.clearCache();

      // Should re-fetch after clear
      await client.discover("https://agent.com");
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    });

    it("invalidateAgent forces re-discovery", async () => {
      const rawCard = createRawAgentCard();
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

      const client = new A2AClient();
      await client.discover("https://agent.com");

      expect(client.invalidateAgent("https://agent.com")).toBe(true);
      expect(client.invalidateAgent("https://agent.com")).toBe(false);
    });
  });

  // =========================================================================
  // Edge case 12: AbortSignal cancellation
  // =========================================================================

  describe("abort signal", () => {
    it("propagates external abort to fetch", async () => {
      vi.useRealTimers();
      // Mock fetch that respects abort signal
      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const onAbort = () =>
              reject(new DOMException("The operation was aborted.", "AbortError"));
            if (init?.signal?.aborted) {
              onAbort();
              return;
            }
            init?.signal?.addEventListener("abort", onAbort, { once: true });
          }),
      );

      const controller = new AbortController();
      const client = new A2AClient();

      const promise = client.discover("https://agent.com", controller.signal);
      controller.abort();

      await expect(promise).rejects.toThrow();
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
  });
});
