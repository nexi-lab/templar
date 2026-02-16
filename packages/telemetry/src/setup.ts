/**
 * OTel SDK initialization — matches Nexus `telemetry.py` pattern.
 *
 * Lazy-loaded: OTel SDK packages are only imported when OTEL_ENABLED=true.
 * This ensures zero overhead when telemetry is disabled.
 */

import { registerMiddlewareWrapper, unregisterMiddlewareWrapper } from "@templar/engine";
import { withTracing } from "./traced-middleware.js";
import type { TelemetryConfig } from "./types.js";

/** Internal state: tracks whether telemetry has been initialized */
let initialized = false;

/** Reference to the NodeSDK for shutdown */
let sdkInstance: { shutdown(): Promise<void> } | undefined;

/**
 * Check if telemetry is enabled via the OTEL_ENABLED env var.
 *
 * Returns true only when OTEL_ENABLED is explicitly set to "true" or "1".
 */
export function isTelemetryEnabled(): boolean {
  const value = process.env.OTEL_ENABLED;
  return value === "true" || value === "1";
}

/**
 * Initialize OpenTelemetry SDK with distributed tracing.
 *
 * Configures:
 * - TracerProvider with BatchSpanProcessor + OTLP HTTP exporter
 * - UndiciInstrumentation (auto-instruments Node fetch / @nexus/sdk calls)
 * - ParentBasedTraceIdRatio sampler (matching Nexus Python)
 * - Resource with service.name, service.version, deployment.environment
 * - Registers middleware wrapper with @templar/core for auto-instrumentation
 *
 * @param config - Optional overrides (env vars are used as defaults)
 * @returns true if telemetry was initialized, false if disabled or already initialized
 */
export async function setupTelemetry(config?: TelemetryConfig): Promise<boolean> {
  if (!isTelemetryEnabled()) {
    return false;
  }

  if (initialized) {
    return false;
  }

  // Dynamic imports — only loaded when telemetry is enabled
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { UndiciInstrumentation } = await import("@opentelemetry/instrumentation-undici");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    "@opentelemetry/semantic-conventions"
  );
  const { Resource } = await import("@opentelemetry/resources");
  const { ParentBasedSampler, TraceIdRatioBasedSampler } = await import(
    "@opentelemetry/sdk-trace-base"
  );

  const serviceName = config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "templar";
  const endpoint =
    config?.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  const rawRatio = config?.sampleRatio ?? parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? "1.0");
  const sampleRatio = Number.isNaN(rawRatio) ? 1.0 : Math.max(0, Math.min(1, rawRatio));
  const environment = config?.environment ?? process.env.OTEL_ENVIRONMENT ?? "development";

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
    "deployment.environment": environment,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(sampleRatio),
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    sampler,
    instrumentations: [new UndiciInstrumentation()],
  });

  sdk.start();

  // Register middleware wrapper with @templar/core for auto-instrumentation
  registerMiddlewareWrapper(withTracing);

  sdkInstance = sdk;
  initialized = true;

  return true;
}

/**
 * Gracefully shut down the OTel SDK, flushing any pending spans.
 *
 * Safe to call even if telemetry was never initialized.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdkInstance !== undefined) {
    await sdkInstance.shutdown();
    unregisterMiddlewareWrapper();
    sdkInstance = undefined;
    initialized = false;
  }
}
