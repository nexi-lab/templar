import type { ReconnectConfig } from "./types.js";

// ---------------------------------------------------------------------------
// ReconnectStrategy
// ---------------------------------------------------------------------------

/**
 * Reconnection strategy with exponential backoff and full jitter.
 *
 * Full jitter (AWS Architecture Blog recommended):
 *   delay = random() * min(maxDelay, baseDelay * 2^attempt)
 *
 * Provides maximum spread across reconnecting clients to prevent
 * thundering herd when a gateway restarts.
 */
export class ReconnectStrategy {
  private readonly config: ReconnectConfig;
  private currentAttempt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: ReconnectConfig) {
    this.config = config;
  }

  /**
   * Calculate the next delay with full jitter and increment the attempt counter.
   */
  nextDelay(): number {
    const { baseDelay, maxDelay } = this.config;
    const cap = Math.min(maxDelay, baseDelay * 2 ** this.currentAttempt);
    const delay = Math.random() * cap;
    this.currentAttempt += 1;
    return delay;
  }

  /**
   * Reset the attempt counter (call on successful connection).
   */
  reset(): void {
    this.currentAttempt = 0;
    this.cancelPending();
  }

  /**
   * Whether max retries have been exhausted.
   */
  get exhausted(): boolean {
    return this.currentAttempt >= this.config.maxRetries;
  }

  /**
   * Current attempt number.
   */
  get attempt(): number {
    return this.currentAttempt;
  }

  /**
   * Schedule a reconnection attempt after the next backoff delay.
   * Cancels any previously scheduled attempt.
   * Returns a cancel function.
   */
  schedule(fn: () => Promise<void>): { cancel: () => void; delay: number } {
    this.cancelPending();

    const delay = this.nextDelay();
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      fn();
    }, delay);

    return {
      cancel: () => {
        this.cancelPending();
      },
      delay,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private cancelPending(): void {
    if (this.pendingTimer !== undefined) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
  }
}
