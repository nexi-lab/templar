import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import type { EventLogBatchWriteResponse, EventLogWriteResponse } from "../../types/eventlog.js";

describe("EventLogResource", () => {
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
  // write()
  // =========================================================================

  describe("write", () => {
    const mockResponse: EventLogWriteResponse = {
      event_id: "evt-001",
      path: "/events/audit/session-123",
      timestamp: "2024-01-15T12:00:00Z",
    };

    it("should write an event with required fields", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.eventLog.write({
        path: "/events/audit/session-123",
        data: { type: "session_start", userId: "user-1" },
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/nfs/write",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            path: "/events/audit/session-123",
            data: { type: "session_start", userId: "user-1" },
          }),
        }),
      );
    });

    it("should write an event with optional timestamp", async () => {
      mockFetchResponse(mockResponse);

      await client.eventLog.write({
        path: "/events/audit/session-123",
        data: { type: "llm_call" },
        timestamp: "2024-01-15T12:30:00Z",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/nfs/write",
        expect.objectContaining({
          body: JSON.stringify({
            path: "/events/audit/session-123",
            data: { type: "llm_call" },
            timestamp: "2024-01-15T12:30:00Z",
          }),
        }),
      );
    });

    it("should omit timestamp when not provided", async () => {
      mockFetchResponse(mockResponse);

      await client.eventLog.write({
        path: "/events/audit/session-123",
        data: { type: "error", message: "something broke" },
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string);

      expect(body).not.toHaveProperty("timestamp");
      expect(body.path).toBe("/events/audit/session-123");
      expect(body.data).toEqual({ type: "error", message: "something broke" });
    });

    it("should return event_id and server timestamp", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.eventLog.write({
        path: "/events/audit/session-123",
        data: { type: "tool_call" },
      });

      expect(result.event_id).toBe("evt-001");
      expect(result.path).toBe("/events/audit/session-123");
      expect(typeof result.timestamp).toBe("string");
    });

    it("should propagate API errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Write failed" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(
        singleRetryClient.eventLog.write({
          path: "/events/audit/session-123",
          data: { type: "error" },
        }),
      ).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        client.eventLog.write({
          path: "/events/audit/session-123",
          data: { type: "session_start" },
        }),
      ).rejects.toThrow("Network error");
    });
  });

  // =========================================================================
  // batchWrite()
  // =========================================================================

  describe("batchWrite", () => {
    const mockResponse: EventLogBatchWriteResponse = {
      written: 3,
      failed: 0,
      event_ids: ["evt-001", "evt-002", "evt-003"],
    };

    it("should write a batch of events", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.eventLog.batchWrite({
        entries: [
          { path: "/events/audit/s-1", data: { type: "llm_call" } },
          { path: "/events/audit/s-1", data: { type: "tool_call" } },
          { path: "/events/audit/s-1", data: { type: "state_change" } },
        ],
      });

      expect(result.written).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.event_ids).toHaveLength(3);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/nfs/write/batch",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should format batch entries correctly", async () => {
      mockFetchResponse(mockResponse);

      await client.eventLog.batchWrite({
        entries: [
          {
            path: "/events/audit/s-1",
            data: { type: "llm_call" },
            timestamp: "2024-01-15T12:00:00Z",
          },
          { path: "/events/audit/s-1", data: { type: "tool_call" } },
        ],
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string);

      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].timestamp).toBe("2024-01-15T12:00:00Z");
      expect(body.entries[1]).not.toHaveProperty("timestamp");
    });

    it("should handle partial failures", async () => {
      const partialResponse: EventLogBatchWriteResponse = {
        written: 2,
        failed: 1,
        event_ids: ["evt-001", "evt-002"],
      };
      mockFetchResponse(partialResponse);

      const result = await client.eventLog.batchWrite({
        entries: [
          { path: "/events/audit/s-1", data: { type: "llm_call" } },
          { path: "/events/audit/s-1", data: { type: "tool_call" } },
          { path: "/events/audit/s-1", data: { type: "invalid" } },
        ],
      });

      expect(result.written).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.event_ids).toHaveLength(2);
    });

    it("should handle empty entries array", async () => {
      const emptyResponse: EventLogBatchWriteResponse = {
        written: 0,
        failed: 0,
        event_ids: [],
      };
      mockFetchResponse(emptyResponse);

      const result = await client.eventLog.batchWrite({ entries: [] });

      expect(result.written).toBe(0);
      expect(result.event_ids).toHaveLength(0);
    });

    it("should propagate API errors on batch write", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Batch write failed" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(
        singleRetryClient.eventLog.batchWrite({
          entries: [{ path: "/events/audit/s-1", data: { type: "error" } }],
        }),
      ).rejects.toThrow();
    });
  });
});
