import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTracing } from "../traced-middleware.js";

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
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

describe("withTracing", () => {
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

  it("should preserve the middleware name", () => {
    const inner: TemplarMiddleware = {
      name: "test-middleware",
      async onSessionStart() {},
    };

    const traced = withTracing(inner);
    expect(traced.name).toBe("test-middleware");
  });

  it("should create span for onSessionStart", async () => {
    const onSessionStart = vi.fn();
    const inner: TemplarMiddleware = {
      name: "audit",
      onSessionStart,
    };

    const traced = withTracing(inner);
    await traced.onSessionStart?.(createSessionContext());

    expect(onSessionStart).toHaveBeenCalledOnce();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("templar.middleware.audit.session_start");
    expect(spans[0]?.attributes["session.id"]).toBe("test-session-1");
  });

  it("should create span for onBeforeTurn", async () => {
    const onBeforeTurn = vi.fn();
    const inner: TemplarMiddleware = {
      name: "memory",
      onBeforeTurn,
    };

    const traced = withTracing(inner);
    await traced.onBeforeTurn?.(createTurnContext(3));

    expect(onBeforeTurn).toHaveBeenCalledOnce();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("templar.middleware.memory.before_turn");
    expect(spans[0]?.attributes["session.id"]).toBe("test-session-1");
    expect(spans[0]?.attributes["turn.number"]).toBe(3);
  });

  it("should create span for onAfterTurn", async () => {
    const onAfterTurn = vi.fn();
    const inner: TemplarMiddleware = {
      name: "pay",
      onAfterTurn,
    };

    const traced = withTracing(inner);
    await traced.onAfterTurn?.(createTurnContext(5));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("templar.middleware.pay.after_turn");
    expect(spans[0]?.attributes["turn.number"]).toBe(5);
  });

  it("should create span for onSessionEnd", async () => {
    const onSessionEnd = vi.fn();
    const inner: TemplarMiddleware = {
      name: "audit",
      onSessionEnd,
    };

    const traced = withTracing(inner);
    await traced.onSessionEnd?.(createSessionContext({ sessionId: "s-42" }));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("templar.middleware.audit.session_end");
    expect(spans[0]?.attributes["session.id"]).toBe("s-42");
  });

  it("should pass through undefined hooks", () => {
    const inner: TemplarMiddleware = {
      name: "minimal",
      // No hooks defined
    };

    const traced = withTracing(inner);
    expect(traced.onSessionStart).toBeUndefined();
    expect(traced.onBeforeTurn).toBeUndefined();
    expect(traced.onAfterTurn).toBeUndefined();
    expect(traced.onSessionEnd).toBeUndefined();
  });

  it("should propagate errors through wrapper", async () => {
    const error = new Error("BudgetExhaustedError");
    const inner: TemplarMiddleware = {
      name: "pay",
      async onAfterTurn() {
        throw error;
      },
    };

    const traced = withTracing(inner);
    await expect(traced.onAfterTurn?.(createTurnContext(1))).rejects.toThrow(
      "BudgetExhaustedError",
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.events[0]?.name).toBe("exception");
  });

  it("should maintain parent-child span relationships", async () => {
    const inner: TemplarMiddleware = {
      name: "test",
      async onSessionStart() {},
      async onBeforeTurn() {},
    };

    const traced = withTracing(inner);

    // Simulate a parent span wrapping both calls
    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("parent.span", async (parentSpan) => {
      await traced.onSessionStart?.(createSessionContext());
      await traced.onBeforeTurn?.(createTurnContext(1));
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);

    const parentSpan = spans.find((s) => s.name === "parent.span");
    const sessionSpan = spans.find((s) => s.name === "templar.middleware.test.session_start");
    const turnSpan = spans.find((s) => s.name === "templar.middleware.test.before_turn");

    expect(parentSpan).toBeDefined();
    expect(sessionSpan?.parentSpanId).toBe(parentSpan?.spanContext().spanId);
    expect(turnSpan?.parentSpanId).toBe(parentSpan?.spanContext().spanId);
  });

  it("should pass context through to inner middleware", async () => {
    const ctx = createTurnContext(1, { metadata: { existing: "data" } });
    let capturedCtx: TurnContext | undefined;

    const inner: TemplarMiddleware = {
      name: "capture",
      async onBeforeTurn(c) {
        capturedCtx = c;
      },
    };

    const traced = withTracing(inner);
    await traced.onBeforeTurn?.(ctx);

    expect(capturedCtx).toBe(ctx);
    expect((capturedCtx?.metadata as Record<string, unknown>)?.existing).toBe("data");
  });
});
