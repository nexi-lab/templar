/**
 * Per-node circuit breaker for delegation fault isolation.
 *
 * 3-state model:
 *   closed    — normal, requests flow through
 *   open      — rejecting, all requests blocked
 *   half-open — one probe request allowed to test recovery
 *
 * ~60 LOC, zero external dependencies. Injectable clock for testing.
 */

// ---------------------------------------------------------------------------
// Config & State
// ---------------------------------------------------------------------------

export interface CircuitBreakerConfig {
  readonly threshold: number;
  readonly cooldownMs: number;
}

export interface CircuitBreakerState {
  readonly failures: number;
  readonly lastFailureAt: number;
  readonly state: "closed" | "open" | "half-open";
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  threshold: 5,
  cooldownMs: 30_000,
};

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly now: () => number;
  private failures: number = 0;
  private lastFailureAt: number = 0;
  private probing: boolean = false;

  constructor(config?: Partial<CircuitBreakerConfig>, now?: () => number) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.now = now ?? Date.now;
  }

  get currentState(): CircuitBreakerState {
    return {
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      state: this.deriveState(),
    };
  }

  get isOpen(): boolean {
    return this.deriveState() === "open";
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailureAt = this.now();
    this.probing = false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lastFailureAt = 0;
    this.probing = false;
  }

  allowsProbe(): boolean {
    if (this.deriveState() !== "half-open") return false;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  private deriveState(): "closed" | "open" | "half-open" {
    if (this.failures < this.config.threshold) return "closed";
    const elapsed = this.now() - this.lastFailureAt;
    if (elapsed >= this.config.cooldownMs) return "half-open";
    return "open";
  }
}
