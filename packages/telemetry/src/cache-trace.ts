/**
 * Prompt Cache Trace Middleware — OTel instrumentation for LLM cache behavior.
 *
 * Records cache hit/miss/creation data as span attributes and metrics
 * on every LLM call via the wrapModelCall hook.
 *
 * Pure observability — does not modify requests or responses.
 */

import { trace } from "@opentelemetry/api";
import type { ModelResponse, TemplarMiddleware } from "@templar/core";
import { isTokenUsage } from "@templar/core";
import {
  getCacheCreationTokens,
  getCacheHits,
  getCacheMisses,
  getCacheReadTokens,
} from "./metrics.js";

/** Cache status determined from token usage fields */
export type CacheStatus = "hit" | "miss" | "creation" | "none";

/**
 * Determine cache status from a model response's usage fields.
 *
 * - `cacheReadTokens > 0` → "hit"
 * - `cacheCreationTokens > 0 && cacheReadTokens === 0` → "creation"
 * - Both zero but fields present → "miss"
 * - Fields absent → "none" (provider doesn't support caching)
 */
export function determineCacheStatus(response: ModelResponse): CacheStatus {
  const usage = response.usage;
  if (usage === undefined || !isTokenUsage(usage)) {
    return "none";
  }

  const cacheRead = usage.cacheReadTokens;
  const cacheCreation = usage.cacheCreationTokens;

  // Fields absent entirely → provider doesn't support caching
  if (cacheRead === undefined && cacheCreation === undefined) {
    return "none";
  }

  const readTokens = cacheRead ?? 0;
  const creationTokens = cacheCreation ?? 0;

  if (readTokens > 0) {
    return "hit";
  }

  if (creationTokens > 0) {
    return "creation";
  }

  return "miss";
}

/**
 * Extract provider prefix from a model identifier.
 * e.g., "anthropic/claude-sonnet-4-5-20250929" → "anthropic"
 * Uses `> 0` (not `>= 0`) so leading-slash models like "/claude" yield "unknown".
 */
function extractProvider(model: string | undefined): string {
  if (model === undefined) return "unknown";
  const slashIndex = model.indexOf("/");
  return slashIndex > 0 ? model.slice(0, slashIndex) : "unknown";
}

/**
 * Enrich the active OTel span with cache attributes from the model response.
 */
function enrichCacheSpan(response: ModelResponse, status: CacheStatus): void {
  const span = trace.getActiveSpan();
  if (span === undefined) return;

  span.setAttribute("cache.status", status);

  const usage = response.usage;
  if (usage !== undefined) {
    span.setAttribute("cache.read_tokens", usage.cacheReadTokens ?? 0);
    span.setAttribute("cache.creation_tokens", usage.cacheCreationTokens ?? 0);
  }

  if (response.model !== undefined) {
    span.setAttribute("cache.model", response.model);
  }
  span.setAttribute("cache.provider", extractProvider(response.model));
}

/**
 * Record cache metrics counters from the model response.
 * Only records when cache fields are present (status !== "none").
 */
function recordCacheMetrics(response: ModelResponse, status: CacheStatus): void {
  if (status === "none") return;

  const model = response.model ?? "unknown";
  const labels = { model };

  if (status === "hit") {
    getCacheHits().add(1, labels);
  } else if (status === "miss") {
    getCacheMisses().add(1, labels);
  }
  // "creation" is not a hit or miss — it's the first time a cache entry is created

  const usage = response.usage;
  const readTokens = usage?.cacheReadTokens ?? 0;
  const creationTokens = usage?.cacheCreationTokens ?? 0;

  if (readTokens > 0) {
    getCacheReadTokens().add(readTokens, labels);
  }
  if (creationTokens > 0) {
    getCacheCreationTokens().add(creationTokens, labels);
  }
}

/**
 * Create the Prompt Cache Trace middleware.
 *
 * Wraps every LLM model call to:
 * 1. Set cache span attributes on the active OTel span
 * 2. Increment cache metrics counters
 *
 * The response is returned unchanged — this is pure observability.
 */
export function createCacheTraceMiddleware(): TemplarMiddleware {
  return {
    name: "prompt-cache-trace",
    async wrapModelCall(req, next) {
      const response = await next(req);
      try {
        const status = determineCacheStatus(response);
        enrichCacheSpan(response, status);
        recordCacheMetrics(response, status);
      } catch {
        // Observability should never break the data path
      }
      return response;
    },
  };
}
