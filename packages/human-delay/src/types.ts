/** Clock abstraction for testable timers */
export interface Clock {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(id: ReturnType<typeof setInterval>): void;
}

/** Human delay configuration */
export interface HumanDelayConfig {
  /** Target words per minute (default: 40 — average human typing speed) */
  readonly wpm?: number;
  /** Gaussian jitter factor 0-1 (default: 0.2 = ±20% variation) */
  readonly jitterFactor?: number;
  /** Minimum delay in ms (default: 500) */
  readonly minDelay?: number;
  /** Maximum delay in ms (default: 8000) */
  readonly maxDelay?: number;
  /** Add extra pauses at sentence boundaries (default: true) */
  readonly punctuationPause?: boolean;
  /** Typing indicator repeat interval in ms (default: 4000) */
  readonly typingRepeatMs?: number;
  /** RNG function for deterministic tests (default: Math.random) */
  readonly random?: () => number;
  /** Clock abstraction for testable timers (default: globalThis) */
  readonly clock?: Clock;
}

export const DEFAULT_CONFIG = {
  wpm: 40,
  jitterFactor: 0.2,
  minDelay: 500,
  maxDelay: 8000,
  punctuationPause: true,
  typingRepeatMs: 4000,
} as const;

/** Fully resolved config (no optionals) */
export interface ResolvedConfig {
  readonly wpm: number;
  readonly jitterFactor: number;
  readonly minDelay: number;
  readonly maxDelay: number;
  readonly punctuationPause: boolean;
  readonly typingRepeatMs: number;
  readonly random: () => number;
  readonly clock: Clock;
}
