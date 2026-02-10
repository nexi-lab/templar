import type { TokenUsage } from "@nexus/sdk";

/**
 * Budget warning event — emitted when spending crosses the alert threshold.
 */
export interface BudgetWarningEvent {
  /** Session that triggered the warning */
  sessionId: string;
  /** Total daily budget in credits */
  budget: number;
  /** Credits spent so far */
  spent: number;
  /** Credits remaining */
  remaining: number;
  /** Budget pressure: spent / budget (0.0–1.0+) */
  pressure: number;
  /** The threshold that was crossed (e.g., 0.8) */
  threshold: number;
}

/**
 * Budget exhausted event — emitted when budget is fully consumed.
 */
export interface BudgetExhaustedEvent {
  /** Session that exhausted the budget */
  sessionId: string;
  /** Total daily budget in credits */
  budget: number;
  /** Credits spent (may exceed budget) */
  spent: number;
}

/**
 * Configuration for NexusPayMiddleware
 */
export interface NexusPayConfig {
  /** Max daily spend in credits (integer) — required */
  dailyBudget: number;

  /** Alert at this fraction of budget (default: 0.8 = 80%) */
  alertThreshold?: number;

  /** Block agent when budget exhausted (default: true) */
  hardLimit?: boolean;

  /** Track per-model costs (default: true) */
  costTracking?: boolean;

  /** Use two-phase transfers: reserve → commit/release (default: true) */
  twoPhaseTransfers?: boolean;

  /** Re-check balance via API every N turns (default: 5) */
  balanceCheckInterval?: number;

  /** Timeout for balance check API calls in ms (default: 3000) */
  balanceCheckTimeoutMs?: number;

  /** Timeout for transfer (reserve/commit/release) API calls in ms (default: 5000) */
  transferTimeoutMs?: number;

  /** Timeout for periodic reconciliation API calls in ms (default: 3000) */
  reconciliationTimeoutMs?: number;

  /** Default estimated cost per turn in credits (used when no history) (default: 10) */
  defaultEstimatedCost?: number;

  /**
   * Custom cost calculator. Receives model name and token usage,
   * returns cost in credits. If not provided, falls back to
   * `usage.totalCost` or `defaultEstimatedCost`.
   */
  costCalculator?: (model: string, usage: TokenUsage) => number;

  /** Called when spending crosses the alert threshold */
  onBudgetWarning?: (event: BudgetWarningEvent) => void | Promise<void>;

  /** Called when budget is fully exhausted */
  onBudgetExhausted?: (event: BudgetExhaustedEvent) => void | Promise<void>;
}

/**
 * Default configuration values
 */
export const DEFAULT_PAY_CONFIG = {
  alertThreshold: 0.8,
  hardLimit: true,
  costTracking: true,
  twoPhaseTransfers: true,
  balanceCheckInterval: 5,
  balanceCheckTimeoutMs: 3000,
  transferTimeoutMs: 5000,
  reconciliationTimeoutMs: 3000,
  defaultEstimatedCost: 10,
} as const;

/**
 * Per-model cost accumulator (bounded by unique model count).
 */
export interface CostEntry {
  /** Total credits spent on this model */
  totalCost: number;
  /** Total tokens consumed by this model */
  totalTokens: number;
  /** Number of LLM requests using this model */
  requestCount: number;
}

/**
 * Prompt cache statistics.
 */
export interface CacheStats {
  /** Number of turns with cache hits */
  hits: number;
  /** Number of turns without cache hits */
  misses: number;
  /** Total cached tokens read */
  cacheReadTokens: number;
  /** Total tokens used to create cache entries */
  cacheCreationTokens: number;
}

/**
 * PSI-style budget pressure metrics injected into TurnContext.metadata.
 */
export interface BudgetPressure {
  /** Credits remaining */
  remaining: number;
  /** Total daily budget */
  dailyBudget: number;
  /** Budget pressure: spent / dailyBudget (0.0–1.0+) */
  pressure: number;
  /** Total credits spent this session */
  sessionCost: number;
  /** Cache hit rate: hits / (hits + misses), or 0 if no data */
  cacheHitRate: number;
}
