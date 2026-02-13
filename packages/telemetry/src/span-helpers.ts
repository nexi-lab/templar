/**
 * Span helper utilities — DRY span creation with error handling.
 *
 * Wraps OpenTelemetry's tracer.startActiveSpan with automatic:
 * - Attribute setting
 * - Error recording + status propagation
 * - Span ending (even on error)
 */

import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { SpanAttributes } from "./types.js";

const TRACER_NAME = "templar";

/**
 * Execute an async function within a named OTel span.
 *
 * - Sets provided attributes on the span
 * - Records exceptions and sets ERROR status on failure
 * - Sets OK status on success
 * - Always ends the span (even on error)
 * - Returns the function's return value
 *
 * When no tracer provider is registered (OTel disabled), the function
 * still executes with a no-op span (zero overhead from OTel API).
 *
 * @param name - Span name (e.g., "templar.middleware.audit.session_start")
 * @param attributes - Key-value pairs to set on the span
 * @param fn - Async function to execute within the span
 * @returns The function's return value
 * @throws Re-throws any error from fn after recording it on the span
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
