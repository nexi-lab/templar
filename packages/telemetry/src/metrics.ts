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
let _cacheHits: Counter | undefined;
let _cacheMisses: Counter | undefined;
let _cacheReadTokens: Counter | undefined;
let _cacheCreationTokens: Counter | undefined;

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

/**
 * Get the counter for prompt cache hits.
 * Lazily creates the counter on first access.
 */
export function getCacheHits(): Counter {
  if (_cacheHits === undefined) {
    _cacheHits = metrics.getMeter(METER_NAME).createCounter("templar.cache.hits", {
      description: "Prompt cache hits",
    });
  }
  return _cacheHits;
}

/**
 * Get the counter for prompt cache misses.
 * Lazily creates the counter on first access.
 */
export function getCacheMisses(): Counter {
  if (_cacheMisses === undefined) {
    _cacheMisses = metrics.getMeter(METER_NAME).createCounter("templar.cache.misses", {
      description: "Prompt cache misses",
    });
  }
  return _cacheMisses;
}

/**
 * Get the counter for prompt cache read tokens.
 * Lazily creates the counter on first access.
 */
export function getCacheReadTokens(): Counter {
  if (_cacheReadTokens === undefined) {
    _cacheReadTokens = metrics.getMeter(METER_NAME).createCounter("templar.cache.read_tokens", {
      description: "Tokens read from prompt cache",
      unit: "tokens",
    });
  }
  return _cacheReadTokens;
}

/**
 * Get the counter for prompt cache creation tokens.
 * Lazily creates the counter on first access.
 */
export function getCacheCreationTokens(): Counter {
  if (_cacheCreationTokens === undefined) {
    _cacheCreationTokens = metrics.getMeter(METER_NAME).createCounter(
      "templar.cache.creation_tokens",
      {
        description: "Tokens used to create cache entries",
        unit: "tokens",
      },
    );
  }
  return _cacheCreationTokens;
}
