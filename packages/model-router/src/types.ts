/**
 * Core types for @templar/model-router
 *
 * Provider-agnostic LLM routing with failover, key rotation,
 * circuit breaking, and pluggable routing strategies.
 */

// ---------------------------------------------------------------------------
// Model Identification
// ---------------------------------------------------------------------------

/** Shorthand model identifier: "provider:model" */
export type ModelId = string;

/** Structured model reference with optional generation parameters */
export interface ModelRef {
  readonly provider: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinking?: ThinkingLevel;
}

/** Union type: callers can pass either shorthand or structured form */
export type ModelSelection = ModelId | ModelRef;

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

export interface Message {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export type ResponseFormat =
  | { readonly type: "text" }
  | { readonly type: "json_object" }
  | { readonly type: "json_schema"; readonly schema: Readonly<Record<string, unknown>> };

// ---------------------------------------------------------------------------
// Provider Interface (2-method contract)
// ---------------------------------------------------------------------------

export interface ModelProvider {
  readonly id: string;
  complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  stream(request: CompletionRequest, signal?: AbortSignal): AsyncIterable<StreamChunk>;
}

// ---------------------------------------------------------------------------
// Request / Response (provider-agnostic)
// ---------------------------------------------------------------------------

export interface CompletionRequest {
  readonly model: string;
  readonly messages: readonly Message[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly tools?: readonly ToolDefinition[];
  readonly thinking?: ThinkingLevel;
  readonly responseFormat?: ResponseFormat;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface CompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly provider: string;
  readonly usage: TokenUsage;
  readonly finishReason: FinishReason;
  readonly toolCalls?: readonly ToolCall[];
  readonly thinkingContent?: string;
  readonly raw: unknown;
}

export type StreamChunkType = "content" | "tool_call" | "thinking" | "usage" | "done";

export interface StreamChunk {
  readonly type: StreamChunkType;
  readonly content?: string;
  readonly usage?: TokenUsage;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens?: number;
  readonly totalCost?: number;
  readonly cacheReadTokens?: number;
  readonly cacheCreationTokens?: number;
}

// ---------------------------------------------------------------------------
// Provider Error Classification (7 categories)
// ---------------------------------------------------------------------------

export type ProviderErrorCategory =
  | "auth"
  | "billing"
  | "rate_limit"
  | "timeout"
  | "context_overflow"
  | "model_error"
  | "thinking"
  | "unknown";

export type FailoverAction =
  | "rotate_key"
  | "backoff"
  | "retry"
  | "compact"
  | "fallback"
  | "thinking_downgrade";

/** Result of classifying a provider error */
export interface ClassificationResult {
  readonly category: ProviderErrorCategory;
  readonly retryAfterMs?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Thinking level for 3-tier downgrade chain */
export type ThinkingLevel = "adaptive" | "extended" | "standard" | "none";

// ---------------------------------------------------------------------------
// Routing Strategy
// ---------------------------------------------------------------------------

export interface RoutingStrategy {
  readonly name: string;
  selectModel(candidates: readonly ModelRef[], context: RoutingContext): ModelRef;
}

export interface RoutingContext {
  readonly request: CompletionRequest;
  readonly metrics: ReadonlyMap<string, ProviderMetrics>;
  readonly sessionId?: string;
}

export interface ProviderMetrics {
  readonly avgLatencyMs: number;
  readonly requestCount: number;
  readonly errorCount: number;
  readonly lastErrorTime: number | null;
}

// ---------------------------------------------------------------------------
// Key Pool
// ---------------------------------------------------------------------------

export interface KeyConfig {
  readonly key: string;
  readonly priority?: number;
}

export interface ProviderConfig {
  readonly keys: readonly KeyConfig[];
  readonly cooldownMs?: number;
  readonly models?: readonly string[];
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly failureWindowMs: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenMaxAttempts: number;
}

export type CircuitState = "closed" | "open" | "half-open";

// ---------------------------------------------------------------------------
// Router Configuration
// ---------------------------------------------------------------------------

export interface ModelRouterConfig {
  readonly providers: Readonly<Record<string, ProviderConfig>>;
  readonly defaultModel: ModelSelection;
  readonly fallbackChain?: readonly ModelSelection[];
  readonly failoverStrategy?: Partial<Readonly<Record<ProviderErrorCategory, FailoverAction>>>;
  readonly routingStrategy?: RoutingStrategy;
  readonly circuitBreaker?: Partial<CircuitBreakerConfig>;
  readonly thinkingDowngrade?: boolean;
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  readonly onPreModelSelect?: (
    candidates: readonly ModelRef[],
  ) => readonly ModelRef[] | Promise<readonly ModelRef[]>;
}

// ---------------------------------------------------------------------------
// Usage Event
// ---------------------------------------------------------------------------

export interface UsageEvent {
  readonly provider: string;
  readonly model: string;
  readonly usage: TokenUsage;
  readonly latencyMs: number;
  readonly cached: boolean;
  readonly timestamp: number;
}
