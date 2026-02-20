import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { ModelRequest, ModelResponse } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCacheTraceMiddleware, determineCacheStatus } from "../cache-trace.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createModelRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    messages: [{ role: "user", content: "hello" }],
    model: "anthropic/claude-sonnet-4-5-20250929",
    ...overrides,
  };
}

function createModelResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    content: "Hi there!",
    model: "anthropic/claude-sonnet-4-5-20250929",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// determineCacheStatus — unit tests
// ---------------------------------------------------------------------------

describe("determineCacheStatus", () => {
  it("should return 'hit' when cacheReadTokens > 0", () => {
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 500,
        cacheCreationTokens: 0,
      },
    });
    expect(determineCacheStatus(response)).toBe("hit");
  });

  it("should return 'hit' when both cacheReadTokens and cacheCreationTokens > 0", () => {
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 300,
        cacheCreationTokens: 200,
      },
    });
    expect(determineCacheStatus(response)).toBe("hit");
  });

  it("should return 'creation' when cacheCreationTokens > 0 and cacheReadTokens === 0", () => {
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 1000,
      },
    });
    expect(determineCacheStatus(response)).toBe("creation");
  });

  it("should return 'miss' when both cache fields are zero", () => {
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });
    expect(determineCacheStatus(response)).toBe("miss");
  });

  it("should return 'none' when cache fields are absent from usage", () => {
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
      },
    });
    expect(determineCacheStatus(response)).toBe("none");
  });

  it("should return 'none' when usage is undefined", () => {
    const response: ModelResponse = { content: "Hi there!" };
    expect(determineCacheStatus(response)).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// createCacheTraceMiddleware — unit tests
// ---------------------------------------------------------------------------

describe("createCacheTraceMiddleware", () => {
  it("should have the correct name", () => {
    const mw = createCacheTraceMiddleware();
    expect(mw.name).toBe("prompt-cache-trace");
  });

  it("should implement wrapModelCall", () => {
    const mw = createCacheTraceMiddleware();
    expect(mw.wrapModelCall).toBeDefined();
  });

  it("should return the response unchanged (no mutation)", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const originalResponse = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 500,
        cacheCreationTokens: 0,
      },
    });

    const result = await mw.wrapModelCall!(req, async () => originalResponse);

    // Same reference — not modified
    expect(result).toBe(originalResponse);
    expect(result.content).toBe("Hi there!");
    expect(result.usage?.cacheReadTokens).toBe(500);
  });

  it("should not throw when response has no usage", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response: ModelResponse = { content: "Hi there!" };

    const result = await mw.wrapModelCall!(req, async () => response);
    expect(result).toBe(response);
  });

  it("should propagate errors from next() without catching them", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();

    await expect(
      mw.wrapModelCall!(req, async () => {
        throw new Error("LLM call failed");
      }),
    ).rejects.toThrow("LLM call failed");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — OTel spans
// ---------------------------------------------------------------------------

describe("createCacheTraceMiddleware (OTel integration)", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.disable();
    provider.register();
  });

  afterEach(async () => {
    trace.disable();
    exporter.reset();
    await provider.shutdown();
  });

  it("should set cache span attributes for a cache hit", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response = createModelResponse({
      model: "anthropic/claude-sonnet-4-5-20250929",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 500,
        cacheCreationTokens: 0,
      },
    });

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan).toBeDefined();
    expect(parentSpan?.attributes["cache.status"]).toBe("hit");
    expect(parentSpan?.attributes["cache.read_tokens"]).toBe(500);
    expect(parentSpan?.attributes["cache.creation_tokens"]).toBe(0);
    expect(parentSpan?.attributes["cache.model"]).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(parentSpan?.attributes["cache.provider"]).toBe("anthropic");
  });

  it("should set cache span attributes for a cache miss", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response = createModelResponse({
      model: "openai/gpt-4",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan?.attributes["cache.status"]).toBe("miss");
    expect(parentSpan?.attributes["cache.provider"]).toBe("openai");
  });

  it("should set cache span attributes for cache creation", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response = createModelResponse({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 1000,
      },
    });

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan?.attributes["cache.status"]).toBe("creation");
    expect(parentSpan?.attributes["cache.creation_tokens"]).toBe(1000);
  });

  it("should set 'none' status when no cache fields present", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response = createModelResponse({
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan?.attributes["cache.status"]).toBe("none");
  });

  it("should handle unknown provider when model has no slash", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response = createModelResponse({
      model: "gpt-4",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 100,
        cacheCreationTokens: 0,
      },
    });

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan?.attributes["cache.provider"]).toBe("unknown");
  });

  it("should not set cache.model when model is undefined", async () => {
    const mw = createCacheTraceMiddleware();
    const req = createModelRequest();
    const response: ModelResponse = {
      content: "Hi there!",
      usage: { inputTokens: 10, outputTokens: 20 },
    };

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("test.parent", async (parentSpan) => {
      await mw.wrapModelCall!(req, async () => response);
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "test.parent");
    expect(parentSpan?.attributes["cache.model"]).toBeUndefined();
    expect(parentSpan?.attributes["cache.provider"]).toBe("unknown");
  });
});
