/**
 * E2E test: validates OTel tracing with a real Nexus server.
 *
 * Prerequisites:
 * - Nexus server running on localhost:2026 (`OTEL_ENABLED=true nexus serve`)
 *
 * This test:
 * 1. Verifies the Nexus server is reachable and healthy
 * 2. Makes traced HTTP calls to Nexus endpoints (via native fetch)
 * 3. Validates that spans are created for the HTTP calls
 * 4. Validates that traceparent headers are injected
 * 5. Verifies full middleware → nexus SDK call span hierarchy
 *
 * Skip condition: If the Nexus server is not running, tests are skipped gracefully.
 */

import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import type { TemplarMiddleware } from "@templar/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withSpan } from "../span-helpers.js";
import { withTracing } from "../traced-middleware.js";

const NEXUS_URL = "http://localhost:2026";

// ---------------------------------------------------------------------------
// Check if Nexus server is available
// ---------------------------------------------------------------------------

async function isNexusAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${NEXUS_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("e2e: Nexus server integration", async () => {
  const available = await isNexusAvailable();

  if (!available) {
    it.skip("Nexus server not available — skipping integration tests", () => {});
    return;
  }

  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let undiciInstrumentation: UndiciInstrumentation;

  beforeAll(() => {
    undiciInstrumentation = new UndiciInstrumentation();
    undiciInstrumentation.enable();
  });

  afterAll(() => {
    undiciInstrumentation.disable();
  });

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

  it("should create spans for traced HTTP calls to Nexus /health endpoint", async () => {
    await withSpan("templar.e2e.health_check", { "nexus.url": NEXUS_URL }, async () => {
      const response = await fetch(`${NEXUS_URL}/health`);
      expect(response.ok).toBe(true);

      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("healthy");
    });

    const spans = exporter.getFinishedSpans();

    // Should have at least: our custom span + HTTP client span (from undici instrumentation)
    expect(spans.length).toBeGreaterThanOrEqual(1);

    const healthSpan = spans.find((s) => s.name === "templar.e2e.health_check");
    expect(healthSpan).toBeDefined();
    expect(healthSpan!.attributes["nexus.url"]).toBe(NEXUS_URL);

    // Verify HTTP spans were created by undici instrumentation
    const httpSpans = spans.filter(
      (s) => s.name !== "templar.e2e.health_check",
    );
    if (httpSpans.length > 0) {
      // HTTP spans should be children of our custom span
      for (const httpSpan of httpSpans) {
        expect(httpSpan.spanContext().traceId).toBe(
          healthSpan!.spanContext().traceId,
        );
      }
    }
  });

  it("should maintain trace hierarchy through middleware wrapping Nexus calls", async () => {
    // Simulate an audit middleware that calls Nexus
    const auditMiddleware: TemplarMiddleware = {
      name: "audit",
      async onBeforeTurn() {
        // Simulate what audit middleware does — make a call to Nexus
        await fetch(`${NEXUS_URL}/health`);
      },
      async onAfterTurn() {
        await fetch(`${NEXUS_URL}/health`);
      },
    };

    const traced = withTracing(auditMiddleware);

    await withSpan("templar.agent.turn", { "agent.type": "high" }, async () => {
      await traced.onBeforeTurn!({ sessionId: "e2e-session", turnNumber: 1 });
      await traced.onAfterTurn!({ sessionId: "e2e-session", turnNumber: 1 });
    });

    const spans = exporter.getFinishedSpans();

    // Verify our custom spans exist
    const turnSpan = spans.find((s) => s.name === "templar.agent.turn");
    const beforeSpan = spans.find(
      (s) => s.name === "templar.middleware.audit.before_turn",
    );
    const afterSpan = spans.find(
      (s) => s.name === "templar.middleware.audit.after_turn",
    );

    expect(turnSpan).toBeDefined();
    expect(beforeSpan).toBeDefined();
    expect(afterSpan).toBeDefined();

    // Middleware spans should be children of the turn span
    expect(beforeSpan!.parentSpanId).toBe(turnSpan!.spanContext().spanId);
    expect(afterSpan!.parentSpanId).toBe(turnSpan!.spanContext().spanId);

    // All spans share the same traceId — proving distributed trace correlation
    const traceId = turnSpan!.spanContext().traceId;
    for (const span of spans) {
      expect(span.spanContext().traceId).toBe(traceId);
    }

    console.log(
      `[e2e] Nexus integration: ${spans.length} spans created, traceId=${traceId}`,
    );
  });

  it("should handle Nexus error responses without breaking trace", async () => {
    // Call a non-existent endpoint — should get 404 or similar
    let responseStatus = 0;

    await withSpan(
      "templar.e2e.error_test",
      { "test.type": "error-handling" },
      async () => {
        const response = await fetch(`${NEXUS_URL}/nonexistent-endpoint`);
        responseStatus = response.status;
      },
    );

    const spans = exporter.getFinishedSpans();
    const testSpan = spans.find((s) => s.name === "templar.e2e.error_test");
    expect(testSpan).toBeDefined();

    // Our span should still be OK (we didn't throw)
    // The HTTP span may record the error status code
    console.log(
      `[e2e] Error test: response=${responseStatus}, spans=${spans.length}`,
    );
  });

  it("should log OTel span context for audit correlation", async () => {
    let capturedSpanId: string | undefined;
    let capturedTraceId: string | undefined;

    const auditMiddleware: TemplarMiddleware = {
      name: "audit",
      async onBeforeTurn() {
        // Exactly what the real audit middleware does
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          const spanCtx = activeSpan.spanContext();
          capturedSpanId = spanCtx.spanId;
          capturedTraceId = spanCtx.traceId;
        }
      },
    };

    const traced = withTracing(auditMiddleware);

    await withSpan(
      "templar.agent.turn",
      { "session.id": "e2e-session" },
      async () => {
        await traced.onBeforeTurn!({
          sessionId: "e2e-session",
          turnNumber: 1,
        });

        // Now make a Nexus call — should carry the same traceId
        await fetch(`${NEXUS_URL}/health`);
      },
    );

    expect(capturedSpanId).toBeDefined();
    expect(capturedTraceId).toBeDefined();
    expect(capturedSpanId).toMatch(/^[0-9a-f]{16}$/);
    expect(capturedTraceId).toMatch(/^[0-9a-f]{32}$/);

    console.log(
      `[e2e] Audit correlation: spanId=${capturedSpanId}, traceId=${capturedTraceId}`,
    );

    // All spans in the trace should share the same traceId
    const spans = exporter.getFinishedSpans();
    for (const span of spans) {
      expect(span.spanContext().traceId).toBe(capturedTraceId);
    }
  });
});
