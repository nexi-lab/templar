import { SpanStatusCode, trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { TemplarMiddleware } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withSpan } from "../span-helpers.js";
import { withTracing } from "../traced-middleware.js";

describe("integration: span hierarchy", () => {
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

  it("should create a full agent turn span hierarchy", async () => {
    // Simulate: agent.turn → middleware.session_start → middleware.before_turn → middleware.after_turn

    const middleware: TemplarMiddleware = {
      name: "audit",
      async onSessionStart() {},
      async onBeforeTurn() {},
      async onAfterTurn() {},
      async onSessionEnd() {},
    };

    const traced = withTracing(middleware);

    await withSpan("templar.agent.turn", { "agent.type": "high" }, async () => {
      await traced.onSessionStart?.({ sessionId: "s-1" });
      await traced.onBeforeTurn?.({ sessionId: "s-1", turnNumber: 1 });
      await traced.onAfterTurn?.({ sessionId: "s-1", turnNumber: 1 });
      await traced.onSessionEnd?.({ sessionId: "s-1" });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(5);

    // All middleware spans should be children of the agent turn span
    const agentSpan = spans.find((s) => s.name === "templar.agent.turn");
    expect(agentSpan).toBeDefined();
    expect(agentSpan?.attributes["agent.type"]).toBe("high");

    const middlewareSpans = spans.filter((s) => s.name.startsWith("templar.middleware."));
    expect(middlewareSpans).toHaveLength(4);

    for (const ms of middlewareSpans) {
      expect(ms.parentSpanId).toBe(agentSpan?.spanContext().spanId);
    }

    // All spans share the same traceId
    const traceId = agentSpan?.spanContext().traceId;
    for (const span of spans) {
      expect(span.spanContext().traceId).toBe(traceId);
    }
  });

  it("should preserve span attributes across the hierarchy", async () => {
    const middleware: TemplarMiddleware = {
      name: "memory",
      async onBeforeTurn() {},
    };

    const traced = withTracing(middleware);

    await withSpan("templar.session", { "session.id": "s-42" }, async () => {
      await traced.onBeforeTurn?.({ sessionId: "s-42", turnNumber: 7 });
    });

    const spans = exporter.getFinishedSpans();
    const sessionSpan = spans.find((s) => s.name === "templar.session");
    const turnSpan = spans.find((s) => s.name === "templar.middleware.memory.before_turn");

    expect(sessionSpan?.attributes["session.id"]).toBe("s-42");
    expect(turnSpan?.attributes["session.id"]).toBe("s-42");
    expect(turnSpan?.attributes["turn.number"]).toBe(7);
  });

  it("should export all spans to the in-memory exporter", async () => {
    await withSpan("span.1", {}, async () => {
      await withSpan("span.2", {}, async () => {
        await withSpan("span.3", {}, async () => {});
      });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.name).sort()).toEqual(["span.1", "span.2", "span.3"]);
  });

  it("should correctly record errors at any level of the hierarchy", async () => {
    try {
      await withSpan("outer", {}, async () => {
        await withSpan("inner", {}, async () => {
          throw new Error("deep failure");
        });
      });
    } catch {
      // expected
    }

    const spans = exporter.getFinishedSpans();
    const inner = spans.find((s) => s.name === "inner");
    const outer = spans.find((s) => s.name === "outer");

    expect(inner?.status.code).toBe(SpanStatusCode.ERROR);
    expect(inner?.status.message).toBe("deep failure");
    expect(outer?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("should handle multiple traced middleware in sequence", async () => {
    const mw1: TemplarMiddleware = {
      name: "audit",
      async onBeforeTurn() {},
    };
    const mw2: TemplarMiddleware = {
      name: "memory",
      async onBeforeTurn() {},
    };

    const traced1 = withTracing(mw1);
    const traced2 = withTracing(mw2);

    await withSpan("templar.turn", {}, async () => {
      await traced1.onBeforeTurn?.({ sessionId: "s-1", turnNumber: 1 });
      await traced2.onBeforeTurn?.({ sessionId: "s-1", turnNumber: 1 });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);

    const auditSpan = spans.find((s) => s.name === "templar.middleware.audit.before_turn");
    const memorySpan = spans.find((s) => s.name === "templar.middleware.memory.before_turn");
    const turnSpan = spans.find((s) => s.name === "templar.turn");

    expect(auditSpan?.parentSpanId).toBe(turnSpan?.spanContext().spanId);
    expect(memorySpan?.parentSpanId).toBe(turnSpan?.spanContext().spanId);
  });
});
