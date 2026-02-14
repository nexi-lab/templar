import { SpanStatusCode, trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withSpan } from "../span-helpers.js";

describe("withSpan", () => {
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

  it("should create a named span with attributes", async () => {
    await withSpan("test.operation", { "test.key": "value", "test.num": 42 }, async () => {
      // no-op
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("test.operation");
    expect(spans[0]?.attributes["test.key"]).toBe("value");
    expect(spans[0]?.attributes["test.num"]).toBe(42);
  });

  it("should set OK status on success", async () => {
    await withSpan("test.ok", {}, async () => "result");

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it("should return the function's return value", async () => {
    const result = await withSpan("test.return", {}, async () => 42);
    expect(result).toBe(42);
  });

  it("should record exception and set ERROR status on failure", async () => {
    const error = new Error("test failure");

    await expect(
      withSpan("test.error", {}, async () => {
        throw error;
      }),
    ).rejects.toThrow("test failure");

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.status.message).toBe("test failure");
    expect(spans[0]?.events).toHaveLength(1);
    expect(spans[0]?.events[0]?.name).toBe("exception");
  });

  it("should handle non-Error throws", async () => {
    await expect(
      withSpan("test.string-error", {}, async () => {
        throw "string error";
      }),
    ).rejects.toBe("string error");

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.status.message).toBe("string error");
  });

  it("should always end the span even on error", async () => {
    try {
      await withSpan("test.always-end", {}, async () => {
        throw new Error("fail");
      });
    } catch {
      // expected
    }

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    // If the span is in getFinishedSpans, it has been ended
  });

  it("should nest spans correctly (parent-child)", async () => {
    await withSpan("parent", { level: "outer" }, async () => {
      await withSpan("child", { level: "inner" }, async () => {
        // no-op
      });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);

    const child = spans.find((s) => s.name === "child");
    const parent = spans.find((s) => s.name === "parent");

    expect(child).toBeDefined();
    expect(parent).toBeDefined();
    // Child's parent span ID should match parent's span ID
    expect(child?.parentSpanId).toBe(parent?.spanContext().spanId);
  });

  it("should set boolean attributes", async () => {
    await withSpan("test.bool", { "test.flag": true }, async () => {});

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.attributes["test.flag"]).toBe(true);
  });
});

describe("withSpan (no provider)", () => {
  it("should execute function with zero overhead when no provider is registered", async () => {
    // Reset to default no-op provider
    trace.disable();

    const result = await withSpan("test.noop", { key: "value" }, async () => "works");
    expect(result).toBe("works");
  });
});
