import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { SessionContext, TurnContext } from "@templar/core";
import { AuditConfigurationError } from "@templar/errors";
import { createMockNexusClient } from "@templar/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNexusAuditMiddleware } from "../index.js";
import { NexusAuditMiddleware, validateAuditConfig } from "../middleware.js";
import type { NexusAuditConfig } from "../types.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

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

describe("NexusAuditMiddleware", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    mockClient.mockEventLog.write.mockResolvedValue(mockWriteSuccess());
    mockClient.mockEventLog.batchWrite.mockResolvedValue(mockBatchWriteSuccess());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.clearAllMocks();
    // Re-apply after clearAllMocks
    mockClient.mockEventLog.write.mockResolvedValue(mockWriteSuccess());
    mockClient.mockEventLog.batchWrite.mockResolvedValue(mockBatchWriteSuccess());
  });

  describe("constructor and name", () => {
    it("should create middleware with name 'nexus-audit'", () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      expect(middleware.name).toBe("nexus-audit");
    });

    it("should apply default config values", () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      expect(middleware).toBeDefined();
    });
  });

  describe("lifecycle - session start", () => {
    it("should emit session_start event on session start", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockEventLog.write).toHaveBeenCalledOnce();
      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      expect(call.path).toBe("/events/audit/test-session-1");

      const data = JSON.parse(call.data);
      expect(data.type).toBe("session_start");
      expect(data.complianceLevel).toBe("soc2");
    });

    it("should include userId in session_start when present", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext({ userId: "user-42" }));

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(call.data);
      expect(data.userId).toBe("user-42");
    });

    it("should reset state on session start", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());

      // First session: run a turn
      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(
        createTurnContext(1, {
          metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        }),
      );
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        }),
      );

      // Second session: start fresh
      mockClient.mockEventLog.write.mockClear();
      await middleware.onSessionStart(createSessionContext({ sessionId: "session-2" }));

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      expect(call.path).toBe("/events/audit/session-2");
    });
  });

  describe("lifecycle - before/after turn", () => {
    it("should generate spanId in onBeforeTurn", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const ctx = createTurnContext(1);
      await middleware.onBeforeTurn(ctx);

      const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
      expect(audit?.spanId).toMatch(UUID_REGEX);
    });

    it("should inject spanId into context.metadata.audit", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const ctx = createTurnContext(1, { metadata: { existing: "data" } });
      await middleware.onBeforeTurn(ctx);

      expect((ctx.metadata as Record<string, unknown>)?.existing).toBe("data");
      const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
      expect(audit?.spanId).toBeDefined();
    });

    it("should increment turnCount on each afterTurn", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 2 }),
      );
      await middleware.onSessionStart(createSessionContext());

      // Turn 1 - no flush (turnCount=1, 1%2 !== 0)
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "hello",
          metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        }),
      );
      expect(mockClient.mockEventLog.batchWrite).not.toHaveBeenCalled();

      // Turn 2 - flush (turnCount=2, 2%2 === 0)
      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onAfterTurn(
        createTurnContext(2, {
          input: "world",
          metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        }),
      );
      expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalled();
    });

    it("should clear spanId after onAfterTurn", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const ctx1 = createTurnContext(1);
      await middleware.onBeforeTurn(ctx1);
      const spanId1 = ((ctx1.metadata as Record<string, unknown>)?.audit as Record<string, unknown>)
        ?.spanId;

      await middleware.onAfterTurn(createTurnContext(1));

      // Next turn should get a different spanId
      const ctx2 = createTurnContext(2);
      await middleware.onBeforeTurn(ctx2);
      const spanId2 = ((ctx2.metadata as Record<string, unknown>)?.audit as Record<string, unknown>)
        ?.spanId;

      expect(spanId1).not.toBe(spanId2);
    });
  });

  describe("lifecycle - session end", () => {
    it("should emit session_end event with turnCount and totalEvents", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      mockClient.mockEventLog.write.mockClear();
      await middleware.onSessionEnd(createSessionContext());

      expect(mockClient.mockEventLog.write).toHaveBeenCalledOnce();
      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(call.data);
      expect(data.type).toBe("session_end");
      expect(data.turnCount).toBe(0);
      expect(typeof data.totalEvents).toBe("number");
    });

    it("should flush remaining buffer before session_end", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 100 }), // High interval to prevent auto-flush
      );
      await middleware.onSessionStart(createSessionContext());

      // Add a buffered event
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        }),
      );

      mockClient.mockEventLog.batchWrite.mockClear();
      mockClient.mockEventLog.write.mockClear();

      await middleware.onSessionEnd(createSessionContext());

      // Should have called batchWrite for buffered events + write for session_end
      expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalled();
      expect(mockClient.mockEventLog.write).toHaveBeenCalled();
    });

    it("should use sessionId from context", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext({ sessionId: "custom-session" }));

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      expect(call.path).toBe("/events/audit/custom-session");
    });
  });

  describe("event creation", () => {
    it("should include all base fields in events", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const call = mockClient.mockEventLog.write.mock.calls[0]?.[0];
      const data = JSON.parse(call.data);

      expect(data.eventId).toMatch(UUID_REGEX);
      expect(data.timestamp).toMatch(ISO_8601_REGEX);
      expect(data.sessionId).toBe("test-session-1");
      expect(typeof data.spanId).toBe("string");
    });

    it("should generate unique eventIds for each event", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const id1 = JSON.parse(mockClient.mockEventLog.write.mock.calls[0]?.[0].data).eventId;

      await middleware.onSessionEnd(createSessionContext());

      const id2 = JSON.parse(mockClient.mockEventLog.write.mock.calls[1]?.[0].data).eventId;
      expect(id1).not.toBe(id2);
    });

    it("should create llm_call events from usage metadata", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
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

      expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalled();
      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const llmEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "llm_call",
      );
      expect(llmEntry).toBeDefined();

      const data = JSON.parse(llmEntry?.data);
      expect(data.model).toBe("claude-opus-4");
      expect(data.inputTokens).toBe(100);
      expect(data.outputTokens).toBe(50);
      expect(data.totalTokens).toBe(150);
    });

    it("should create tool_call events from toolCalls metadata", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            toolCalls: [{ name: "readFile", input: { path: "/tmp/test" }, durationMs: 15 }],
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const toolEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "tool_call",
      );
      expect(toolEntry).toBeDefined();

      const data = JSON.parse(toolEntry?.data);
      expect(data.toolName).toBe("readFile");
      expect(data.durationMs).toBe(15);
    });

    it("should create message events from input and output", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(
        createTurnContext(1, {
          input: "Hello agent",
          output: "Hello user",
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const types = entries.map((e: { data: string }) => JSON.parse(e.data).type);
      expect(types).toContain("message_received");
      expect(types).toContain("message_sent");
    });
  });

  describe("cost attribution", () => {
    it("should include cost from budget metadata in llm_call at soc2 level", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ complianceLevel: "soc2", flushIntervalTurns: 1 }),
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
            budget: {
              remaining: 900,
              dailyBudget: 1000,
              pressure: 0.1,
              sessionCost: 100,
            },
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const llmEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "llm_call",
      );
      const data = JSON.parse(llmEntry?.data);
      expect(data.cost).toBe(100);
    });

    it("should include cost at hipaa level", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ complianceLevel: "hipaa", flushIntervalTurns: 1 }),
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
            budget: {
              remaining: 800,
              dailyBudget: 1000,
              pressure: 0.2,
              sessionCost: 200,
            },
          },
        }),
      );

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const llmEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "llm_call",
      );
      const data = JSON.parse(llmEntry?.data);
      expect(data.cost).toBe(200);
    });

    it("should omit cost when budget metadata is missing", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ complianceLevel: "soc2", flushIntervalTurns: 1 }),
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

      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const llmEntry = entries.find(
        (e: { data: string }) => JSON.parse(e.data).type === "llm_call",
      );
      const data = JSON.parse(llmEntry?.data);
      expect(data.cost).toBeUndefined();
    });
  });

  describe("factory", () => {
    it("should create middleware via factory function", () => {
      const middleware = createNexusAuditMiddleware(mockClient.client, createConfig());
      expect(middleware).toBeInstanceOf(NexusAuditMiddleware);
      expect(middleware.name).toBe("nexus-audit");
    });

    it("should throw AuditConfigurationError on invalid config", () => {
      expect(() =>
        createNexusAuditMiddleware(mockClient.client, {
          complianceLevel: "invalid" as "soc2",
        }),
      ).toThrow(AuditConfigurationError);
    });

    it("should validate before constructing", () => {
      expect(() =>
        createNexusAuditMiddleware(mockClient.client, createConfig({ maxBufferSize: -1 })),
      ).toThrow(AuditConfigurationError);
    });
  });

  describe("validateAuditConfig", () => {
    it("should accept valid config", () => {
      expect(() => validateAuditConfig(createConfig())).not.toThrow();
    });

    it("should reject invalid compliance level", () => {
      expect(() => validateAuditConfig({ complianceLevel: "invalid" as "soc2" })).toThrow(
        AuditConfigurationError,
      );
      expect(() => validateAuditConfig({ complianceLevel: "invalid" as "soc2" })).toThrow(
        /Invalid complianceLevel/,
      );
    });
  });

  describe("with OTel active", () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
      exporter = new InMemorySpanExporter();
      provider = new NodeTracerProvider();
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
      trace.disable(); // Clear any previous global provider
      provider.register();
    });

    afterEach(async () => {
      trace.disable();
      exporter.reset();
      await provider.shutdown();
    });

    it("should use OTel spanId when active span is present", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const tracer = trace.getTracer("test");
      await tracer.startActiveSpan("test.turn", async (span) => {
        const expectedSpanId = span.spanContext().spanId;
        const ctx = createTurnContext(1);
        await middleware.onBeforeTurn(ctx);

        const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
        expect(audit?.spanId).toBe(expectedSpanId);

        span.end();
      });
    });

    it("should include traceId in audit metadata when OTel is active", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const tracer = trace.getTracer("test");
      await tracer.startActiveSpan("test.turn", async (span) => {
        const expectedTraceId = span.spanContext().traceId;
        const ctx = createTurnContext(1);
        await middleware.onBeforeTurn(ctx);

        const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
        expect(audit?.traceId).toBe(expectedTraceId);

        span.end();
      });
    });

    it("should include traceId in audit events when OTel is active", async () => {
      const middleware = new NexusAuditMiddleware(
        mockClient.client,
        createConfig({ flushIntervalTurns: 1 }),
      );
      await middleware.onSessionStart(createSessionContext());

      const tracer = trace.getTracer("test");
      await tracer.startActiveSpan("test.turn", async (span) => {
        const expectedTraceId = span.spanContext().traceId;
        await middleware.onBeforeTurn(createTurnContext(1));
        await middleware.onAfterTurn(
          createTurnContext(1, {
            input: "hello",
            metadata: { usage: { model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          }),
        );

        const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
        for (const entry of entries) {
          const data = JSON.parse(entry.data);
          expect(data.traceId).toBe(expectedTraceId);
        }

        span.end();
      });
    });
  });

  describe("without OTel (UUID fallback)", () => {
    beforeEach(() => {
      // Ensure no OTel provider is active
      trace.disable();
    });

    it("should generate UUID spanId when no OTel span is active", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const ctx = createTurnContext(1);
      await middleware.onBeforeTurn(ctx);

      const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
      expect(audit?.spanId).toMatch(UUID_REGEX);
    });

    it("should not include traceId when no OTel span is active", async () => {
      const middleware = new NexusAuditMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      const ctx = createTurnContext(1);
      await middleware.onBeforeTurn(ctx);

      const audit = (ctx.metadata as Record<string, unknown>)?.audit as Record<string, unknown>;
      expect(audit?.traceId).toBeUndefined();
    });
  });
});
