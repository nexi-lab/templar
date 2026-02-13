/**
 * Named priority bands for hook execution ordering.
 * Lower number = higher priority = executes first.
 * Users can use any number; these are convenience constants.
 */
export const HOOK_PRIORITY = {
  /** Priority 0 — runs first, for critical guards (security, auth) */
  CRITICAL: 0,
  /** Priority 25 — runs early, for important interceptors */
  HIGH: 25,
  /** Priority 100 — default priority */
  NORMAL: 100,
  /** Priority 200 — runs late, for non-critical observers */
  LOW: 200,
  /** Priority 500 — runs last, for monitoring/logging */
  MONITOR: 500,
} as const;

/** Default timeout for hook handlers in milliseconds */
export const DEFAULT_HOOK_TIMEOUT = 30_000;

/** Default maximum re-entrancy depth for emit() calls */
export const DEFAULT_MAX_DEPTH = 10;

/** Pre-allocated continue result to avoid object allocation on hot path */
export const CONTINUE_RESULT: { readonly action: "continue" } = Object.freeze({
  action: "continue",
} as const);

/** Events that support block/modify (interceptor) semantics */
export const INTERCEPTOR_EVENTS = [
  "PreToolUse",
  "PreModelCall",
  "PreModelSelect",
  "PreMessage",
  "BudgetExhausted",
  "PreCompact",
] as const;
