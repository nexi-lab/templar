/**
 * OTel metrics for Templar agent operations.
 *
 * Provides counters and histograms for monitoring agent performance.
 * Lazily initialized — meters are only created on first access.
 * When no meter provider is registered, these return no-op instruments.
 */

import type { Counter, Histogram } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

const METER_NAME = "templar";

let _agentOperations: Counter | undefined;
let _agentLatency: Histogram | undefined;

/**
 * Get the counter for total agent operations (turns, tool calls, etc.).
 * Lazily creates the counter on first access.
 */
export function getAgentOperations(): Counter {
  if (_agentOperations === undefined) {
    _agentOperations = metrics.getMeter(METER_NAME).createCounter("templar.agent.operations", {
      description: "Total agent operations",
    });
  }
  return _agentOperations;
}

/**
 * Get the histogram for operation latency in milliseconds.
 * Lazily creates the histogram on first access.
 */
export function getAgentLatency(): Histogram {
  if (_agentLatency === undefined) {
    _agentLatency = metrics.getMeter(METER_NAME).createHistogram("templar.agent.latency_ms", {
      description: "Operation latency in milliseconds",
      unit: "ms",
    });
  }
  return _agentLatency;
}
