import type { CircuitBreakerConfig, CircuitState } from "./types.js";

interface ProviderCircuitState {
  state: CircuitState;
  failures: number[];
  lastFailureTime: number;
  openedAt: number;
  halfOpenAttempts: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
};

/**
 * Per-provider circuit breaker with three states:
 * - closed: normal operation, tracking failures
 * - open: rejecting requests, waiting for reset timeout
 * - half-open: allowing limited probe requests
 *
 * Lazy cleanup: failure timestamps outside the window are pruned on recordFailure.
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly states: Map<string, ProviderCircuitState>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.states = new Map();
  }

  /**
   * Check if a provider is available for requests.
   * Transitions open → half-open when reset timeout has elapsed.
   */
  canExecute(provider: string): boolean {
    const state = this.getOrCreate(provider);

    switch (state.state) {
      case "closed":
        return true;
      case "open": {
        const now = Date.now();
        if (now - state.openedAt >= this.config.resetTimeoutMs) {
          state.state = "half-open";
          state.halfOpenAttempts = 0;
          return true;
        }
        return false;
      }
      case "half-open":
        return state.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }
  }

  /**
   * Record a successful request. Resets the circuit to closed.
   */
  recordSuccess(provider: string): void {
    const state = this.getOrCreate(provider);
    state.state = "closed";
    state.failures = [];
    state.halfOpenAttempts = 0;
  }

  /**
   * Record a failed request. May trip the circuit to open.
   */
  recordFailure(provider: string): void {
    const state = this.getOrCreate(provider);
    const now = Date.now();

    if (state.state === "half-open") {
      state.halfOpenAttempts++;
      if (state.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        state.state = "open";
        state.openedAt = now;
      }
      return;
    }

    // Prune failures outside the window (lazy cleanup)
    const windowStart = now - this.config.failureWindowMs;
    state.failures = state.failures.filter((t) => t > windowStart);
    state.failures.push(now);
    state.lastFailureTime = now;

    if (state.failures.length >= this.config.failureThreshold) {
      state.state = "open";
      state.openedAt = now;
      state.failures = [];
    }
  }

  /**
   * Get the current circuit state for a provider.
   */
  getState(provider: string): CircuitState {
    const state = this.states.get(provider);
    if (!state) return "closed";

    // Check for automatic transition from open → half-open
    if (state.state === "open") {
      const now = Date.now();
      if (now - state.openedAt >= this.config.resetTimeoutMs) {
        state.state = "half-open";
        state.halfOpenAttempts = 0;
      }
    }

    return state.state;
  }

  private getOrCreate(provider: string): ProviderCircuitState {
    let state = this.states.get(provider);
    if (!state) {
      state = {
        state: "closed",
        failures: [],
        lastFailureTime: 0,
        openedAt: 0,
        halfOpenAttempts: 0,
      };
      this.states.set(provider, state);
    }
    return state;
  }
}
