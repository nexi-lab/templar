/**
 * Canonical token usage type — the single source of truth for LLM cost tracking.
 *
 * Both @nexus/sdk and @templar/model-router conform to this shape.
 * Used by @templar/middleware/pay for cost attribution and reporting.
 *
 * `model` is optional because provider-level usage (e.g., CompletionResponse.usage
 * from model-router) may not include it — the model is on the response, not the usage.
 * Pay middleware falls back to "unknown" when model is absent.
 */
export interface TokenUsage {
  /** Model identifier (e.g., "claude-sonnet-4-5-20250929"). Optional at provider level. */
  readonly model?: string;

  /** Number of input/prompt tokens */
  readonly inputTokens: number;

  /** Number of output/completion tokens */
  readonly outputTokens: number;

  /** Total tokens (input + output). Optional — computed from input + output if absent. */
  readonly totalTokens?: number;

  /** Provider-reported total cost (if available) */
  readonly totalCost?: number;

  /** Cached prompt tokens read (e.g., Anthropic prompt caching) */
  readonly cacheReadTokens?: number;

  /** Tokens used to create cache entries */
  readonly cacheCreationTokens?: number;
}

/**
 * Type guard for TokenUsage — validates required numeric fields.
 *
 * Requires `inputTokens` and `outputTokens` (always present from any provider).
 * Does NOT require `model` or `totalTokens` — these are optional at the provider level.
 *
 * Used by pay middleware to safely extract usage from turn context metadata,
 * replacing unsafe `as TokenUsage` casts.
 */
export function isTokenUsage(value: unknown): value is TokenUsage {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.inputTokens === "number" && typeof record.outputTokens === "number";
}
