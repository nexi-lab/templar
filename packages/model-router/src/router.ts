import {
  type ErrorCode,
  ExternalError,
  isExternalError,
  isPermissionError,
  isRateLimitError,
  isTemplarError,
  isTimeoutError,
  isValidationError,
} from "@templar/errors";
import { CircuitBreaker } from "./circuit-breaker.js";
import { KeyPool } from "./key-pool.js";
import { normalizeModelSelection } from "./model-id.js";
import { FallbackStrategy } from "./strategies/fallback.js";
import type {
  CompletionRequest,
  CompletionResponse,
  FailoverAction,
  ModelProvider,
  ModelRef,
  ModelRouterConfig,
  ProviderErrorCategory,
  StreamChunk,
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
  unknown: "retry",
};

/**
 * Classify a thrown error into a ProviderErrorCategory.
 * Uses type guards from @templar/errors to avoid generic type parameter issues.
 */
function classifyError(error: unknown): ProviderErrorCategory {
  if (!isTemplarError(error)) return "unknown";

  const code: ErrorCode = error.code;

  if (isPermissionError(error)) {
    if (code === "MODEL_PROVIDER_AUTH_FAILED") return "auth";
    return "auth";
  }
  if (isRateLimitError(error)) return "rate_limit";
  if (isTimeoutError(error)) return "timeout";
  if (isValidationError(error)) {
    if (code === "MODEL_CONTEXT_OVERFLOW") return "context_overflow";
    return "unknown";
  }
  if (isExternalError(error)) {
    if (code === "MODEL_PROVIDER_BILLING_FAILED") return "billing";
    if (code === "MODEL_PROVIDER_ERROR") return "model_error";
    return "unknown";
  }
  return "unknown";
}

/**
 * Compute exponential backoff delay with jitter.
 */
function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const delay = Math.min(baseMs * 2 ** attempt, maxMs);
  // Add ±25% jitter
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, delay + jitter);
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

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Multi-provider LLM router with resilience features:
 * - Key rotation with cooldown
 * - Per-provider circuit breaker
 * - Configurable routing strategies
 * - Automatic failover with retry
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
    const targets = this.buildTargetChain(request);
    let lastError: unknown;
    let thinkingDowngraded = false;

    for (const target of targets) {
      const provider = this.providers.get(target.provider);
      if (!provider) continue;

      if (!this.circuitBreaker.canExecute(target.provider)) continue;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const keyConfig = this.keyPool.selectKey(target.provider);
        if (!keyConfig) break; // all keys exhausted for this provider

        const effectiveRequest = this.buildEffectiveRequest(request, target, thinkingDowngraded);

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

          const category = classifyError(error);
          const action = this.failoverStrategy[category];

          if (category === "context_overflow" && this.thinkingDowngrade && !thinkingDowngraded) {
            thinkingDowngraded = true;
            continue;
          }

          if (action === "rotate_key") {
            this.keyPool.markCooldown(target.provider, keyConfig.key);
            continue;
          }

          if (action === "backoff") {
            this.keyPool.markCooldown(target.provider, keyConfig.key);
            this.circuitBreaker.recordFailure(target.provider);
            const delay = backoffDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
            await sleep(delay, signal);
            continue;
          }

          if (action === "retry") {
            this.circuitBreaker.recordFailure(target.provider);
            const delay = backoffDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
            await sleep(delay, signal);
            continue;
          }

          if (action === "fallback") {
            this.circuitBreaker.recordFailure(target.provider);
            break; // move to next target
          }

          // "compact" without thinking downgrade — fallback
          this.circuitBreaker.recordFailure(target.provider);
          break;
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
    const targets = this.buildTargetChain(request);
    let lastError: unknown;
    let thinkingDowngraded = false;

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

        const effectiveRequest = this.buildEffectiveRequest(request, target, thinkingDowngraded);

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
          const category = classifyError(error);
          const action = this.failoverStrategy[category];

          if (category === "context_overflow" && this.thinkingDowngrade && !thinkingDowngraded) {
            thinkingDowngraded = true;
            continue;
          }

          if (action === "rotate_key") {
            this.keyPool.markCooldown(target.provider, keyConfig.key);
            continue;
          }

          if (action === "backoff") {
            this.keyPool.markCooldown(target.provider, keyConfig.key);
            this.circuitBreaker.recordFailure(target.provider);
            const delay = backoffDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
            await sleep(delay, signal);
            continue;
          }

          if (action === "retry") {
            this.circuitBreaker.recordFailure(target.provider);
            const delay = backoffDelay(attempt, this.retryBaseDelayMs, this.retryMaxDelayMs);
            await sleep(delay, signal);
            continue;
          }

          if (action === "fallback") {
            this.circuitBreaker.recordFailure(target.provider);
            break;
          }

          this.circuitBreaker.recordFailure(target.provider);
          break;
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

  /** Build the ordered list of model targets to try */
  private buildTargetChain(request: CompletionRequest): readonly ModelRef[] {
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

    return chain;
  }

  /** Build an effective request with model overrides applied */
  private buildEffectiveRequest(
    request: CompletionRequest,
    target: ModelRef,
    thinkingDowngraded: boolean,
  ): CompletionRequest {
    return {
      ...request,
      model: target.model,
      ...(target.temperature !== undefined ? { temperature: target.temperature } : {}),
      ...(target.maxTokens !== undefined ? { maxTokens: target.maxTokens } : {}),
      ...(thinkingDowngraded ? { thinking: "none" as const } : {}),
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

  /** Record metrics for a provider */
  private recordMetrics(provider: string, latencyMs: number, isError: boolean): void {
    let m = this.metrics.get(provider);
    if (!m) {
      m = { totalLatency: 0, requestCount: 0, errorCount: 0, lastErrorTime: null };
      this.metrics.set(provider, m);
    }
    m.totalLatency += latencyMs;
    m.requestCount++;
    if (isError) {
      m.errorCount++;
      m.lastErrorTime = Date.now();
    }
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
