import { ExternalError } from "@templar/errors";
import { CircuitBreaker } from "./circuit-breaker.js";
import { classifyError } from "./classify.js";
import { KeyPool } from "./key-pool.js";
import { normalizeModelSelection } from "./model-id.js";
import { FallbackStrategy } from "./strategies/fallback.js";
import type {
  CompletionRequest,
  CompletionResponse,
  FailoverAction,
  KeyConfig,
  ModelProvider,
  ModelRef,
  ModelRouterConfig,
  ProviderErrorCategory,
  StreamChunk,
  ThinkingLevel,
  UsageEvent,
} from "./types.js";

/** Default failover actions per error category */
const DEFAULT_FAILOVER: Readonly<Record<ProviderErrorCategory, FailoverAction>> = {
  auth: "rotate_key",
  billing: "rotate_key",
  rate_limit: "backoff",
  timeout: "retry",
  context_overflow: "compact",
  model_error: "fallback",
  thinking: "thinking_downgrade",
  unknown: "retry",
};

/**
 * Compute full-jitter backoff delay.
 * Full Jitter: sleep = random(0, min(cap, base * 2^attempt))
 */
function fullJitterDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponentialDelay = Math.min(baseMs * 2 ** attempt, maxMs);
  return Math.random() * exponentialDelay;
}

/**
 * Sleep for a duration, respecting an abort signal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    let onAbort: (() => void) | undefined;

    const timer = setTimeout(() => {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (signal) {
      onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Resolution returned by the failover resolver */
interface FailoverResolution {
  readonly action: "continue" | "break_target" | "sleep_continue";
  readonly delayMs?: number;
  readonly thinkingLevel?: ThinkingLevel;
}

/**
 * Map thinking levels to their downgrade targets.
 * adaptive and extended are treated as equivalent tiers,
 * both downgrading to "standard" before "none".
 */
const THINKING_DOWNGRADE_CHAIN: Partial<Readonly<Record<ThinkingLevel, ThinkingLevel>>> = {
  adaptive: "standard",
  extended: "standard",
  standard: "none",
};

/**
 * Multi-provider LLM router with resilience features:
 * - Key rotation with cooldown
 * - Per-provider circuit breaker
 * - Configurable routing strategies
 * - Automatic failover with retry
 * - 3-tier thinking downgrade chain
 * - Full Jitter backoff with Retry-After support
 * - PreModelSelect hook for candidate reordering
 * - Cost/usage tracking via events
 */
export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly providers: ReadonlyMap<string, ModelProvider>;
  private readonly keyPool: KeyPool;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly defaultModel: ModelRef;
  private readonly fallbackChain: readonly ModelRef[];
  private readonly failoverStrategy: Readonly<Record<ProviderErrorCategory, FailoverAction>>;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly thinkingDowngrade: boolean;
  private readonly usageListeners: Set<(event: UsageEvent) => void>;
  private readonly metrics: Map<
    string,
    { totalLatency: number; requestCount: number; errorCount: number; lastErrorTime: number | null }
  >;

  constructor(config: ModelRouterConfig, providers: ReadonlyMap<string, ModelProvider>) {
    this.config = config;
    this.providers = providers;
    this.keyPool = new KeyPool(config.providers);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.defaultModel = normalizeModelSelection(config.defaultModel);
    this.fallbackChain = config.fallbackChain?.map(normalizeModelSelection) ?? [];
    this.failoverStrategy = { ...DEFAULT_FAILOVER, ...config.failoverStrategy };
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 1_000;
    this.retryMaxDelayMs = config.retryMaxDelayMs ?? 10_000;
    this.thinkingDowngrade = config.thinkingDowngrade ?? true;
    this.usageListeners = new Set();
    this.metrics = new Map();
  }

  /**
   * Complete a request through the routing chain with failover.
   */
  async complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    const targets = await this.buildTargetChain(request);
    let lastError: unknown;
    let currentThinkingLevel: ThinkingLevel =
      (request.thinking as ThinkingLevel | undefined) ?? "none";

    for (const target of targets) {
      const provider = this.providers.get(target.provider);
      if (!provider) continue;

      if (!this.circuitBreaker.canExecute(target.provider)) continue;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const keyConfig = this.keyPool.selectKey(target.provider);
        if (!keyConfig) break;

        const effectiveRequest = this.buildEffectiveRequest(request, target, currentThinkingLevel);

        const startTime = Date.now();
        try {
          const response = await provider.complete(effectiveRequest, signal);
          const latencyMs = Date.now() - startTime;
          this.circuitBreaker.recordSuccess(target.provider);
          this.recordMetrics(target.provider, latencyMs, false);
          this.emitUsage(target, response.usage, latencyMs);
          return response;
        } catch (error) {
          const latencyMs = Date.now() - startTime;
          lastError = error;
          this.recordMetrics(target.provider, latencyMs, true);

          const resolution = this.resolveFailoverAction(
            error,
            target.provider,
            keyConfig,
            attempt,
            currentThinkingLevel,
          );

          if (resolution.thinkingLevel !== undefined) {
            currentThinkingLevel = resolution.thinkingLevel;
          }

          if (resolution.action === "break_target") break;

          if (resolution.action === "sleep_continue" && resolution.delayMs !== undefined) {
            await sleep(resolution.delayMs, signal);
          }
          // "continue" and "sleep_continue" both continue the retry loop
        }
      }
    }

    throw new ExternalError<"MODEL_ALL_PROVIDERS_FAILED">({
      code: "MODEL_ALL_PROVIDERS_FAILED",
      message: `All providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      ...(lastError instanceof Error ? { cause: lastError } : {}),
    });
  }

  /**
   * Stream a request through the routing chain with head-of-stream retry.
   */
  async *stream(request: CompletionRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const targets = await this.buildTargetChain(request);
    let lastError: unknown;
    let currentThinkingLevel: ThinkingLevel =
      (request.thinking as ThinkingLevel | undefined) ?? "none";

    for (const target of targets) {
      const provider = this.providers.get(target.provider);
      if (!provider) continue;

      if (!this.circuitBreaker.canExecute(target.provider)) continue;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const keyConfig = this.keyPool.selectKey(target.provider);
        if (!keyConfig) break;

        const effectiveRequest = this.buildEffectiveRequest(request, target, currentThinkingLevel);

        const startTime = Date.now();
        let receivedFirstChunk = false;

        try {
          const stream = provider.stream(effectiveRequest, signal);

          for await (const chunk of stream) {
            receivedFirstChunk = true;
            yield chunk;

            if (chunk.type === "usage" && chunk.usage) {
              const latencyMs = Date.now() - startTime;
              this.emitUsage(target, chunk.usage, latencyMs);
            }
          }

          this.circuitBreaker.recordSuccess(target.provider);
          this.recordMetrics(target.provider, Date.now() - startTime, false);
          return;
        } catch (error) {
          const latencyMs = Date.now() - startTime;
          lastError = error;
          this.recordMetrics(target.provider, latencyMs, true);

          // Mid-stream error: can't replay, propagate to consumer
          if (receivedFirstChunk) {
            throw error;
          }

          // Head-of-stream: apply failover logic
          const resolution = this.resolveFailoverAction(
            error,
            target.provider,
            keyConfig,
            attempt,
            currentThinkingLevel,
          );

          if (resolution.thinkingLevel !== undefined) {
            currentThinkingLevel = resolution.thinkingLevel;
          }

          if (resolution.action === "break_target") break;

          if (resolution.action === "sleep_continue" && resolution.delayMs !== undefined) {
            await sleep(resolution.delayMs, signal);
          }
        }
      }
    }

    throw new ExternalError<"MODEL_ALL_PROVIDERS_FAILED">({
      code: "MODEL_ALL_PROVIDERS_FAILED",
      message: `All providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      ...(lastError instanceof Error ? { cause: lastError } : {}),
    });
  }

  /**
   * Subscribe to usage events. Returns a disposer function.
   */
  onUsage(callback: (event: UsageEvent) => void): () => void {
    this.usageListeners.add(callback);
    return () => {
      this.usageListeners.delete(callback);
    };
  }

  /**
   * Get diagnostic state for a provider.
   */
  getProviderState(provider: string): {
    circuitBreaker: string;
    availableKeys: number;
    totalKeys: number;
  } {
    return {
      circuitBreaker: this.circuitBreaker.getState(provider),
      availableKeys: this.keyPool.availableKeys(provider),
      totalKeys: this.keyPool.totalKeys(provider),
    };
  }

  /**
   * Get collected metrics for a provider.
   */
  getMetrics(provider: string): Readonly<{
    avgLatencyMs: number;
    requestCount: number;
    errorCount: number;
    lastErrorTime: number | null;
  }> {
    const m = this.metrics.get(provider);
    if (!m) {
      return { avgLatencyMs: 0, requestCount: 0, errorCount: 0, lastErrorTime: null };
    }
    return {
      avgLatencyMs: m.requestCount > 0 ? m.totalLatency / m.requestCount : 0,
      requestCount: m.requestCount,
      errorCount: m.errorCount,
      lastErrorTime: m.lastErrorTime,
    };
  }

  /**
   * Resolve failover action for a caught error. DRY helper used by both
   * complete() and stream().
   */
  private resolveFailoverAction(
    error: unknown,
    provider: string,
    keyConfig: KeyConfig,
    attempt: number,
    thinkingLevel: ThinkingLevel,
  ): FailoverResolution {
    const classification = classifyError(error, provider);
    const category = classification.category;
    const action = this.failoverStrategy[category];

    // Thinking downgrade on thinking errors or context overflow
    if (
      (category === "thinking" || category === "context_overflow") &&
      this.thinkingDowngrade &&
      thinkingLevel !== "none"
    ) {
      const nextLevel = THINKING_DOWNGRADE_CHAIN[thinkingLevel];
      if (nextLevel !== undefined) {
        return { action: "continue", thinkingLevel: nextLevel };
      }
    }

    if (action === "thinking_downgrade") {
      // Explicit thinking_downgrade action from custom strategy
      if (this.thinkingDowngrade && thinkingLevel !== "none") {
        const nextLevel = THINKING_DOWNGRADE_CHAIN[thinkingLevel];
        if (nextLevel !== undefined) {
          return { action: "continue", thinkingLevel: nextLevel };
        }
      }
      // Can't downgrade further — fall back to next target
      this.circuitBreaker.recordFailure(provider);
      return { action: "break_target" };
    }

    if (action === "rotate_key") {
      this.keyPool.markCooldown(provider, keyConfig.key);
      return { action: "continue" };
    }

    if (action === "backoff") {
      this.keyPool.markCooldown(provider, keyConfig.key);
      this.circuitBreaker.recordFailure(provider);
      const calculatedDelay = fullJitterDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
      const delay = Math.max(calculatedDelay, classification.retryAfterMs ?? 0);
      return { action: "sleep_continue", delayMs: delay };
    }

    if (action === "retry") {
      this.circuitBreaker.recordFailure(provider);
      const calculatedDelay = fullJitterDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
      const delay = Math.max(calculatedDelay, classification.retryAfterMs ?? 0);
      return { action: "sleep_continue", delayMs: delay };
    }

    if (action === "fallback") {
      this.circuitBreaker.recordFailure(provider);
      return { action: "break_target" };
    }

    // "compact" or any unrecognized action — break to next target
    this.circuitBreaker.recordFailure(provider);
    return { action: "break_target" };
  }

  /** Build the ordered list of model targets to try */
  private async buildTargetChain(request: CompletionRequest): Promise<readonly ModelRef[]> {
    const strategy = this.config.routingStrategy ?? new FallbackStrategy();

    // Build candidates from default + fallback chain
    const allCandidates = [this.defaultModel, ...this.fallbackChain];

    // Use routing strategy to select the primary target
    const metricsMap = this.buildMetricsMap();
    const primary = strategy.selectModel(allCandidates, {
      request,
      metrics: metricsMap,
    });

    // Build chain: primary first, then remaining fallbacks in order
    const chain: ModelRef[] = [primary];
    for (const candidate of allCandidates) {
      if (candidate.provider !== primary.provider || candidate.model !== primary.model) {
        chain.push(candidate);
      }
    }

    // Apply onPreModelSelect callback if configured
    if (this.config.onPreModelSelect) {
      try {
        const overridden = await this.config.onPreModelSelect(chain);
        if (overridden.length > 0) return overridden;
      } catch {
        // Callback error — fall back to default chain
      }
    }

    return chain;
  }

  /** Build an effective request with model overrides and thinking level applied */
  private buildEffectiveRequest(
    request: CompletionRequest,
    target: ModelRef,
    currentThinkingLevel: ThinkingLevel,
  ): CompletionRequest {
    return {
      ...request,
      model: target.model,
      ...(target.temperature !== undefined ? { temperature: target.temperature } : {}),
      ...(target.maxTokens !== undefined ? { maxTokens: target.maxTokens } : {}),
      ...(currentThinkingLevel !== request.thinking ? { thinking: currentThinkingLevel } : {}),
    };
  }

  /** Emit a usage event (fire-and-forget, swallow callback errors) */
  private emitUsage(target: ModelRef, usage: CompletionResponse["usage"], latencyMs: number): void {
    const event: UsageEvent = {
      provider: target.provider,
      model: target.model,
      usage,
      latencyMs,
      cached: (usage.cacheReadTokens ?? 0) > 0,
      timestamp: Date.now(),
    };

    for (const listener of this.usageListeners) {
      try {
        listener(event);
      } catch {
        // Fire-and-forget: swallow callback errors
      }
    }
  }

  /** Record metrics for a provider (immutable update) */
  private recordMetrics(provider: string, latencyMs: number, isError: boolean): void {
    const current = this.metrics.get(provider) ?? {
      totalLatency: 0,
      requestCount: 0,
      errorCount: 0,
      lastErrorTime: null,
    };
    this.metrics.set(provider, {
      totalLatency: current.totalLatency + latencyMs,
      requestCount: current.requestCount + 1,
      errorCount: current.errorCount + (isError ? 1 : 0),
      lastErrorTime: isError ? Date.now() : current.lastErrorTime,
    });
  }

  /** Build a readonly metrics map for routing context */
  private buildMetricsMap(): ReadonlyMap<
    string,
    {
      avgLatencyMs: number;
      requestCount: number;
      errorCount: number;
      lastErrorTime: number | null;
    }
  > {
    const map = new Map<
      string,
      {
        avgLatencyMs: number;
        requestCount: number;
        errorCount: number;
        lastErrorTime: number | null;
      }
    >();

    for (const [provider, m] of this.metrics) {
      map.set(provider, {
        avgLatencyMs: m.requestCount > 0 ? m.totalLatency / m.requestCount : 0,
        requestCount: m.requestCount,
        errorCount: m.errorCount,
        lastErrorTime: m.lastErrorTime,
      });
    }

    return map;
  }
}
