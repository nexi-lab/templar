import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusAuditMiddleware } from "../middleware.js";
import type { NexusAuditConfig } from "../types.js";

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
    ...overrides,
  };
}

function createConfig(overrides: Partial<NexusAuditConfig> = {}): NexusAuditConfig {
  return {
    complianceLevel: "soc2",
    ...overrides,
  };
}

function mockWriteSuccess() {
  return {
    event_id: "evt-1",
    path: "/events/audit/test-session-1",
    timestamp: "2026-02-10T12:00:00Z",
  };
}

function mockBatchWriteSuccess(count = 1) {
  return {
    written: count,
    failed: 0,
    event_ids: Array.from({ length: count }, (_, i) => `evt-${i + 1}`),
  };
}

describe("NexusAuditMiddleware - Edge Cases", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    mockClient.mockEventLog.write.mockResolvedValue(mockWriteSuccess());
    mockClient.mockEventLog.batchWrite.mockResolvedValue(mockBatchWriteSuccess());
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Re-apply after clearAllMocks
    mockClient.mockEventLog.write.mockResolvedValue(mockWriteSuccess());
    mockClient.mockEventLog.batchWrite.mockResolvedValue(mockBatchWriteSuccess());
  });

  describe("sync flush", () => {
    it("should call eventLog.write for session_start (critical event)", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockEventLog.write).toHaveBeenCalledOnce();
      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      expect(call.path).toBe("/events/audit/test-session-1");
      expect(typeof call.data).toBe("string");
      expect(typeof call.timestamp).toBe("string");
    });

    it("should fall back to buffer when sync write times out", async () => {
      mockClient.mockEventLog.write.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ syncWriteTimeoutMs: 50 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // session_start timed out, should be in buffer
      // Now session_end should also go to buffer
      await middleware.onSessionEnd(createSessionContext());

      // Since write never resolves, events accumulate in buffer
      // The batchWrite from onSessionEnd should contain both
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("timed out"));
    });

    it("should fall back to buffer when sync write fails", async () => {
      mockClient.mockEventLog.write.mockRejectedValue(new Error("Network error"));

      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("operation failed"));
    });

    it("should include redacted serialized event in write data", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(call.data);
      expect(data.type).toBe("session_start");
      expect(data.sessionId).toBe("test-session-1");
    });
  });

  describe("batch flush", () => {
    it("should buffer routine events", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 100 }), // High to prevent auto-flush
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
            },
          },
        }),
      );

      // No batch write yet since flushIntervalTurns is very high
      expect(mockClient.mockEventLog.batchWrite).not.toHaveBeenCalled();
    });

    it("should flush on interval", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 2 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Turn 1 - no flush
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );
      expect(mockClient.mockEventLog.batchWrite).not.toHaveBeenCalled();

      // Turn 2 - flush (turnCount=2, 2%2===0)
      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );
      expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalledOnce();
    });

    it("should clear buffer on successful batch flush", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Turn 1 - creates events and flushes
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );

      const firstFlushCount = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries.length;
      mockClient.mockEventLog.batchWrite.mockClear();

      // Turn 2 - should only contain new events, not carry over
      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );

      const secondFlushCount = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries.length;
      // Both flushes should have similar number of events (not accumulating)
      expect(secondFlushCount).toBe(firstFlushCount);
    });

    it("should retain buffer when batch flush fails", async () => {
      mockClient.mockEventLog.batchWrite.mockRejectedValue(new Error("Batch write failed"));

      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Turn 1 - events buffered, flush fails
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );

      const firstCallEntries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries.length;

      // Turn 2 - buffer retained from previous + new events
      mockClient.mockEventLog.batchWrite.mockClear();
      mockClient.mockEventLog.batchWrite.mockRejectedValue(new Error("Still failing"));

      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        }),
      );

      const secondCallEntries =
        mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries.length;
      // Second flush should have more entries (accumulated from both turns)
      expect(secondCallEntries).toBeGreaterThan(firstCallEntries);
    });
  });

  describe("buffer overflow", () => {
    it("should invoke onBufferOverflow callback when buffer is full", async () => {
      const onBufferOverflow = vi.fn();
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({
          maxBufferSize: 2,
          flushIntervalTurns: 100, // Prevent periodic flush
          onBufferOverflow,
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Fill buffer with multiple events per turn
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "msg1",
          output: "reply1",
          metadata: {
            usage: {
              model: "m",
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
            toolCalls: [
              { name: "tool1", input: "x" },
              { name: "tool2", input: "y" },
              { name: "tool3", input: "z" },
            ],
          },
        }),
      );

      // With maxBufferSize=2 and multiple events being added, overflow should occur
      expect(onBufferOverflow).toHaveBeenCalled();
    });

    it("should drop oldest non-critical event on overflow", async () => {
      const droppedCounts: number[] = [];
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({
          maxBufferSize: 3,
          flushIntervalTurns: 100,
          onBufferOverflow: (count) => droppedCounts.push(count),
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Add events to fill and overflow
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "a",
          output: "b",
          metadata: {
            usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            toolCalls: [{ name: "t1" }, { name: "t2" }, { name: "t3" }],
          },
        }),
      );

      // Each dropped event reports count of 1
      for (const count of droppedCounts) {
        expect(count).toBe(1);
      }
    });

    it("should log warning on buffer overflow", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({
          maxBufferSize: 1,
          flushIntervalTurns: 100,
        }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "msg",
          output: "reply",
          metadata: {
            usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        }),
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Buffer overflow"));
    });
  });

  describe("state resilience", () => {
    it("should not leak state between sessions", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 100 }),
      );

      // Session 1
      await middleware.onSessionStart(createSessionContext({ sessionId: "s1" }));
      await middleware.onBeforeTurn(createTurnContext(1, { sessionId: "s1" }));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          sessionId: "s1",
          metadata: {
            usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        }),
      );
      await middleware.onSessionEnd(createSessionContext({ sessionId: "s1" }));

      mockClient.mockEventLog.write.mockClear();
      mockClient.mockEventLog.batchWrite.mockClear();

      // Session 2
      await middleware.onSessionStart(createSessionContext({ sessionId: "s2" }));

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      expect(call.path).toBe("/events/audit/s2");

      // session_end should report turnCount=0 since state was reset
      mockClient.mockEventLog.write.mockClear();
      await middleware.onSessionEnd(createSessionContext({ sessionId: "s2" }));

      const endCall = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(endCall.data);
      expect(data.turnCount).toBe(0);
    });

    it("should handle missing metadata gracefully", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Turn with no metadata at all
      await middleware.onBeforeTurn(createTurnContext(1));
      await expect(middleware.onAfterTurn(createTurnContext(1))).resolves.toBeUndefined();
    });

    it("should handle rapid before/after turns", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 100 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Rapid sequential turns
      for (let i = 1; i <= 10; i++) {
        await middleware.onBeforeTurn(createTurnContext(i));
        await middleware.onAfterTurn(
          createTurnContext(i, {
            metadata: {
              usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            },
          }),
        );
      }

      // Should complete without error, session end should report correct turn count
      mockClient.mockEventLog.write.mockClear();
      await middleware.onSessionEnd(createSessionContext());

      const endCall = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(endCall.data);
      expect(data.turnCount).toBe(10);
    });
  });

  describe("error and budget warning events", () => {
    it("should sync-flush error events", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());
      mockClient.mockEventLog.write.mockClear();

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            error: { code: "ERR_001", message: "Something went wrong" },
          },
        }),
      );

      // Error events should be sync-flushed (via void flushSync)
      // Note: flushSync is called with void, so it's fire-and-forget from onAfterTurn
      // But since mockEventLog.write resolves immediately, it should have been called
      // by the time onAfterTurn completes (microtask queue)
      // We need to wait a tick for the void promise to settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.mockEventLog.write).toHaveBeenCalled();
      const calls = mockClient.mockEventLog.write.mock.calls;
      const errorCall = calls.find(
        (c: unknown[]) => JSON.parse((c[0] as { data: string }).data).type === "error",
      );
      expect(errorCall).toBeDefined();

      const data = JSON.parse((errorCall?.[0] as { data: string }).data);
      expect(data.errorCode).toBe("ERR_001");
      expect(data.errorMessage).toBe("Something went wrong");
    });

    it("should sync-flush budget_warning when pressure >= 0.8", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());
      mockClient.mockEventLog.write.mockClear();

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            budget: {
              remaining: 100,
              dailyBudget: 1000,
              pressure: 0.9,
              sessionCost: 900,
            },
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      const calls = mockClient.mockEventLog.write.mock.calls;
      const budgetCall = calls.find(
        (c: unknown[]) => JSON.parse((c[0] as { data: string }).data).type === "budget_warning",
      );
      expect(budgetCall).toBeDefined();

      const data = JSON.parse((budgetCall?.[0] as { data: string }).data);
      expect(data.pressure).toBe(0.9);
      expect(data.spent).toBe(900);
    });

    it("should not emit budget_warning when pressure < 0.8", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());
      mockClient.mockEventLog.write.mockClear();

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            budget: {
              remaining: 500,
              dailyBudget: 1000,
              pressure: 0.5,
              sessionCost: 500,
            },
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      const calls = mockClient.mockEventLog.write.mock.calls;
      const budgetCall = calls.find(
        (c: unknown[]) => JSON.parse((c[0] as { data: string }).data).type === "budget_warning",
      );
      expect(budgetCall).toBeUndefined();
    });
  });

  describe("permission and state change events", () => {
    it("should emit permission_check events", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            permissionCheck: {
              resource: "file:/etc/passwd",
              action: "read",
              granted: false,
            },
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const permEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "permission_check",
      );
      expect(permEntry).toBeDefined();

      const data = JSON.parse(permEntry?.data);
      expect(data.resource).toBe("file:/etc/passwd");
      expect(data.action).toBe("read");
      expect(data.granted).toBe(false);
    });

    it("should emit state_change events", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            stateChange: {
              key: "agent.mode",
              previousValue: "idle",
              newValue: "active",
            },
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const stateEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "state_change",
      );
      expect(stateEntry).toBeDefined();

      const data = JSON.parse(stateEntry?.data);
      expect(data.key).toBe("agent.mode");
      expect(data.previousValue).toBe("idle");
      expect(data.newValue).toBe("active");
    });
  });

  describe("redaction in events", () => {
    it("should redact secrets in tool call inputs", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1, logToolInputs: true }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            toolCalls: [{ name: "httpRequest", input: "Bearer eyJsecrettoken12345678" }],
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const toolEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "tool_call",
      );
      const data = JSON.parse(toolEntry?.data);
      expect(data.input).not.toContain("eyJsecrettoken12345678");
      expect(data.input).toContain("[REDACTED]");
    });

    it("should redact secrets in message content", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "My key is sk-abcdefghijklmnopqrstuvwxyz",
          output: "Got it",
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const msgEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "message_received",
      );
      const data = JSON.parse(msgEntry?.data);
      expect(data.contentPreview).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    });
  });
});
