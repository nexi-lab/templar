/**
 * @templar/telemetry — OpenTelemetry distributed tracing for Templar runtime.
 *
 * Public API:
 * - setupTelemetry() / shutdownTelemetry() — SDK lifecycle
 * - isTelemetryEnabled() — check OTEL_ENABLED env var
 * - withSpan() — DRY span creation helper
 * - withTracing() — middleware wrapper
 * - agentOperations / agentLatency / tokenUsage / costTotal — OTel metrics
 *
 * Selective OTel API re-exports for advanced users.
 */

// Selective OTel re-exports for advanced users
export { context, SpanStatusCode, trace } from "@opentelemetry/api";
export { getAgentLatency, getAgentOperations, getCostTotal, getTokenUsage } from "./metrics.js";
export { isTelemetryEnabled, setupTelemetry, shutdownTelemetry } from "./setup.js";
export { withSpan } from "./span-helpers.js";
export { withTracing } from "./traced-middleware.js";
export type { SpanAttributes, SpanAttributeValue, TelemetryConfig } from "./types.js";
