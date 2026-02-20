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
let _tokenUsage: Counter | undefined;
let _costTotal: Counter | undefined;

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

/**
 * Get the counter for total tokens consumed across all models.
 * Lazily creates the counter on first access.
 */
export function getTokenUsage(): Counter {
  if (_tokenUsage === undefined) {
    _tokenUsage = metrics.getMeter(METER_NAME).createCounter("templar.tokens.total", {
      description: "Total tokens consumed",
    });
  }
  return _tokenUsage;
}

/**
 * Get the counter for total cost in credits across all sessions.
 * Lazily creates the counter on first access.
 */
export function getCostTotal(): Counter {
  if (_costTotal === undefined) {
    _costTotal = metrics.getMeter(METER_NAME).createCounter("templar.cost.total", {
      description: "Total cost in credits",
      unit: "credits",
    });
  }
  return _costTotal;
}
