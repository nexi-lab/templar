/**
 * OTel Trace Context Utilities for AG-UI SSE Streams
 *
 * Extracts W3C Trace Context (traceparent) from incoming HTTP requests
 * and creates stream spans for distributed trace correlation.
 *
 * Uses @opentelemetry/api directly — returns no-op spans when no
 * OTel SDK is registered (zero overhead when telemetry is disabled).
 */

import type * as http from "node:http";
import type { Context, Span } from "@opentelemetry/api";
import { context, propagation, trace } from "@opentelemetry/api";

const TRACER_NAME = "templar.agui";

/**
 * Carrier getter for extracting W3C Trace Context from Node.js HTTP headers.
 *
 * Maps the OTel TextMapGetter interface to http.IncomingHttpHeaders,
 * handling the string | string[] | undefined union that Node returns.
 */
const headerGetter = {
  get(carrier: http.IncomingHttpHeaders, key: string): string | undefined {
    const value = carrier[key];
    if (Array.isArray(value)) return value[0];
    return value;
  },
  keys(carrier: http.IncomingHttpHeaders): string[] {
    return Object.keys(carrier);
  },
};

/**
 * Extract OTel context from incoming HTTP request headers.
 *
 * Parses the `traceparent` (and optional `tracestate`) headers using
 * the registered OTel propagator (W3C TraceContext by default).
 *
 * When no OTel SDK is registered, returns ROOT_CONTEXT (no-op).
 */
export function extractTraceContext(req: http.IncomingMessage): Context {
  return propagation.extract(context.active(), req.headers, headerGetter);
}

/**
 * Start an OTel span for an AG-UI SSE stream.
 *
 * The span is created within the extracted trace context, ensuring
 * parent-child linkage with the caller's trace (if traceparent was sent).
 *
 * @param parentContext - Context extracted from the HTTP request
 * @param attributes - Span attributes (threadId, runId, etc.)
 * @returns The created span (no-op span when OTel SDK is not registered)
 */
export function startStreamSpan(parentContext: Context, attributes: Record<string, string>): Span {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startSpan("agui.stream", { attributes }, parentContext);
}

/**
 * Extract the 32-hex traceId from a span's context.
 *
 * Returns the trace ID regardless of whether the span is sampled.
 * When OTel is disabled (no-op span), returns the all-zeros trace ID
 * ("00000000000000000000000000000000").
 */
export function getTraceId(span: Span): string {
  return span.spanContext().traceId;
}

/**
 * Format a span's context as a W3C traceparent header value.
 *
 * Format: `{version}-{traceId}-{spanId}-{traceFlags}`
 * Example: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
 */
export function formatTraceparent(span: Span): string {
  const ctx = span.spanContext();
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/** The all-zeros trace ID returned by no-op spans when OTel is disabled. */
export const INVALID_TRACE_ID = "00000000000000000000000000000000";

/**
 * Check whether a trace ID is valid (non-zero).
 *
 * The OTel API returns all-zeros for no-op spans. This utility
 * distinguishes real trace IDs from the no-op sentinel.
 */
export function isValidTraceId(traceId: string): boolean {
  return traceId !== INVALID_TRACE_ID;
}
