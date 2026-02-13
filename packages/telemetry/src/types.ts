/**
 * Telemetry configuration types.
 *
 * Matches the Nexus Python telemetry pattern: env-var driven,
 * sensible defaults, explicit opt-in via OTEL_ENABLED.
 */

/**
 * Configuration for OpenTelemetry setup.
 * All fields are optional — defaults are resolved from env vars or sensible values.
 */
export interface TelemetryConfig {
  /** Service name for resource identification (default: "templar") */
  serviceName?: string;
  /** OTLP exporter endpoint (default: from OTEL_EXPORTER_OTLP_ENDPOINT or "http://localhost:4318") */
  endpoint?: string;
  /** Trace sampling ratio 0.0-1.0 (default: from OTEL_TRACES_SAMPLER_ARG or 1.0) */
  sampleRatio?: number;
  /** Deployment environment (default: from OTEL_ENVIRONMENT or "development") */
  environment?: string;
}

/**
 * Standard span attribute types accepted by OpenTelemetry.
 */
export type SpanAttributeValue = string | number | boolean;

/**
 * Record of span attributes.
 */
export type SpanAttributes = Record<string, SpanAttributeValue>;
