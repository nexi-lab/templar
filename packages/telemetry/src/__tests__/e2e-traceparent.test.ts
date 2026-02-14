/**
 * E2E test: validates full distributed tracing pipeline.
 *
 * Tests:
 * 1. traceparent header propagation via UndiciInstrumentation to a real HTTP server
 * 2. Full span hierarchy: agent turn → middleware hooks → HTTP calls
 * 3. Audit middleware picks up OTel span context (spanId + traceId)
 * 4. Performance: OTel overhead is negligible (<1ms per operation)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import type { TemplarMiddleware } from "@templar/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withSpan } from "../span-helpers.js";
import { withTracing } from "../traced-middleware.js";

// ---------------------------------------------------------------------------
// Test HTTP server that captures traceparent headers
// ---------------------------------------------------------------------------

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  traceparent: string | undefined;
  tracestate: string | undefined;
}

function createTestServer(): Promise<{
  port: number;
  server: ReturnType<typeof createServer>;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const requests: CapturedRequest[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      requests.push({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers as Record<string, string | string[] | undefined>,
        traceparent: req.headers.traceparent as string | undefined,
        tracestate: req.headers.tracestate as string | undefined,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      resolve({
        port,
        server,
        requests,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// W3C traceparent format validation
// ---------------------------------------------------------------------------

/**
 * Validates W3C Trace Context traceparent header format:
 * `{version}-{traceId}-{parentId}-{flags}`
 * e.g., `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01`
 */
function isValidTraceparent(value: string): boolean {
  const parts = value.split("-");
  if (parts.length !== 4) return false;
  const [version, traceId, parentId, flags] = parts;
  return (
    version === "00" &&
    /^[0-9a-f]{32}$/.test(traceId) &&
    /^[0-9a-f]{16}$/.test(parentId) &&
    /^[0-9a-f]{2}$/.test(flags)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("e2e: traceparent propagation", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;
  let undiciInstrumentation: UndiciInstrumentation;

  beforeAll(async () => {
    testServer = await createTestServer();
    // Enable UndiciInstrumentation once — it patches Node's undici globally
    undiciInstrumentation = new UndiciInstrumentation();
    undiciInstrumentation.enable();
  });

  afterAll(async () => {
    undiciInstrumentation.disable();
    await testServer.close();
  });

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.disable();
    provider.register();

    testServer.requests.length = 0;
  });

  afterEach(async () => {
    trace.disable();
    exporter.reset();
    await provider.shutdown();
  });

  it("should inject traceparent header into fetch() calls", async () => {
    await withSpan("templar.agent.turn", { "agent.type": "high" }, async () => {
      const response = await fetch(`http://127.0.0.1:${testServer.port}/api/test`);
      expect(response.ok).toBe(true);
    });

    // Verify the test server received the traceparent header
    expect(testServer.requests).toHaveLength(1);
    const req = testServer.requests[0];
    expect(req.traceparent).toBeDefined();
    expect(isValidTraceparent(req.traceparent!)).toBe(true);

    // Verify the traceparent contains our trace ID
    const spans = exporter.getFinishedSpans();
    const agentSpan = spans.find((s) => s.name === "templar.agent.turn");
    expect(agentSpan).toBeDefined();

    const traceId = agentSpan!.spanContext().traceId;
    expect(req.traceparent!).toContain(traceId);
  });

  it("should maintain trace context through middleware → fetch chain", async () => {
    const middleware: TemplarMiddleware = {
      name: "test-mw",
      async onBeforeTurn() {
        // Simulate a nexus SDK call within middleware
        await fetch(`http://127.0.0.1:${testServer.port}/api/nexus-call`);
      },
    };

    const traced = withTracing(middleware);

    await withSpan("templar.agent.turn", { "agent.type": "high" }, async () => {
      await traced.onBeforeTurn!({ sessionId: "s-1", turnNumber: 1 });
    });

    // Verify span hierarchy: agent.turn → middleware.before_turn → HTTP span
    const spans = exporter.getFinishedSpans();
    const agentSpan = spans.find((s) => s.name === "templar.agent.turn");
    const mwSpan = spans.find((s) => s.name === "templar.middleware.test-mw.before_turn");

    expect(agentSpan).toBeDefined();
    expect(mwSpan).toBeDefined();
    expect(mwSpan!.parentSpanId).toBe(agentSpan!.spanContext().spanId);

    // All spans share the same traceId
    const traceId = agentSpan!.spanContext().traceId;
    for (const span of spans) {
      expect(span.spanContext().traceId).toBe(traceId);
    }

    // Verify traceparent was sent to the HTTP server
    expect(testServer.requests).toHaveLength(1);
    expect(testServer.requests[0].traceparent).toBeDefined();
    expect(testServer.requests[0].traceparent!).toContain(traceId);
  });

  it("should propagate trace context across multiple HTTP calls", async () => {
    await withSpan("templar.session", { "session.id": "s-42" }, async () => {
      // Multiple sequential fetch calls should all carry the same trace
      await fetch(`http://127.0.0.1:${testServer.port}/api/call-1`);
      await fetch(`http://127.0.0.1:${testServer.port}/api/call-2`);
      await fetch(`http://127.0.0.1:${testServer.port}/api/call-3`);
    });

    expect(testServer.requests).toHaveLength(3);

    // All requests should have traceparent
    for (const req of testServer.requests) {
      expect(req.traceparent).toBeDefined();
      expect(isValidTraceparent(req.traceparent!)).toBe(true);
    }

    // All requests should share the same traceId
    const traceIds = testServer.requests.map(
      (r) => r.traceparent!.split("-")[1],
    );
    expect(new Set(traceIds).size).toBe(1);
  });
});

describe("e2e: audit middleware OTel integration", () => {
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

  it("should provide OTel span context to audit middleware's onBeforeTurn", async () => {
    // Simulate what happens when audit middleware reads span context
    let capturedSpanId: string | undefined;
    let capturedTraceId: string | undefined;

    const auditMiddleware: TemplarMiddleware = {
      name: "audit",
      async onBeforeTurn() {
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          const spanCtx = activeSpan.spanContext();
          capturedSpanId = spanCtx.spanId;
          capturedTraceId = spanCtx.traceId;
        }
      },
    };

    const traced = withTracing(auditMiddleware);

    await withSpan("templar.agent.turn", { "agent.type": "high" }, async () => {
      await traced.onBeforeTurn!({ sessionId: "s-1", turnNumber: 1 });
    });

    // The audit middleware should have captured the span context
    expect(capturedSpanId).toBeDefined();
    expect(capturedTraceId).toBeDefined();

    // Verify it's a valid 16-char hex (OTel spanId) not a UUID
    expect(capturedSpanId).toMatch(/^[0-9a-f]{16}$/);
    expect(capturedTraceId).toMatch(/^[0-9a-f]{32}$/);

    // The captured span should be the middleware span (which is the active one inside onBeforeTurn)
    const mwSpan = exporter.getFinishedSpans().find(
      (s) => s.name === "templar.middleware.audit.before_turn",
    );
    expect(mwSpan).toBeDefined();
    expect(capturedSpanId).toBe(mwSpan!.spanContext().spanId);
    expect(capturedTraceId).toBe(mwSpan!.spanContext().traceId);
  });

  it("should NOT provide span context when OTel is not configured", async () => {
    // Disable the provider
    trace.disable();
    exporter.reset();

    let capturedSpanId: string | undefined;

    const middleware: TemplarMiddleware = {
      name: "test",
      async onBeforeTurn() {
        const activeSpan = trace.getActiveSpan();
        capturedSpanId = activeSpan?.spanContext().spanId;
      },
    };

    // Execute without tracing wrapper — simulates OTel disabled
    await middleware.onBeforeTurn!({ sessionId: "s-1", turnNumber: 1 });

    // No span context should be available
    expect(capturedSpanId).toBeUndefined();
  });
});

describe("e2e: performance benchmark", () => {
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

  it("should have negligible overhead per traced middleware call", async () => {
    const middleware: TemplarMiddleware = {
      name: "perf-test",
      async onBeforeTurn() {
        // Minimal work — just attribute access
        return;
      },
    };

    const traced = withTracing(middleware);
    const iterations = 1000;

    // Warmup
    for (let i = 0; i < 10; i++) {
      await traced.onBeforeTurn!({ sessionId: "s-1", turnNumber: i });
    }
    exporter.reset();

    // Benchmark with OTel
    const startOtel = performance.now();
    for (let i = 0; i < iterations; i++) {
      await traced.onBeforeTurn!({ sessionId: "s-1", turnNumber: i });
    }
    const durationOtel = performance.now() - startOtel;

    // Benchmark without OTel (raw middleware)
    trace.disable();
    const startRaw = performance.now();
    for (let i = 0; i < iterations; i++) {
      await middleware.onBeforeTurn!({ sessionId: "s-1", turnNumber: i });
    }
    const durationRaw = performance.now() - startRaw;

    const overheadPerCall = (durationOtel - durationRaw) / iterations;

    // Log for visibility
    console.log(
      `[perf] ${iterations} calls — OTel: ${durationOtel.toFixed(1)}ms, raw: ${durationRaw.toFixed(1)}ms, overhead/call: ${overheadPerCall.toFixed(3)}ms`,
    );

    // Target: <0.5ms overhead per call (generous — actual should be ~0.05ms)
    expect(overheadPerCall).toBeLessThan(0.5);

    // Verify spans were created
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(iterations);
  });

  it("should handle 100 concurrent traced operations without contention", async () => {
    const concurrency = 100;

    const start = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        withSpan(`concurrent.${i}`, { index: i }, async () => {
          // Simulate minimal async work
          await new Promise((resolve) => setTimeout(resolve, 1));
        }),
      ),
    );
    const duration = performance.now() - start;

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(concurrency);

    // All spans should have unique spanIds
    const spanIds = new Set(spans.map((s) => s.spanContext().spanId));
    expect(spanIds.size).toBe(concurrency);

    console.log(
      `[perf] ${concurrency} concurrent spans completed in ${duration.toFixed(1)}ms`,
    );

    // Should complete in reasonable time (generous bound)
    expect(duration).toBeLessThan(5000);
  });
});
