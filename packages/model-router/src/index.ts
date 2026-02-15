/**
 * @templar/model-router
 *
 * Multi-provider LLM routing with production-grade resilience:
 * key rotation, automatic failover, circuit breakers, cost tracking,
 * and configurable routing strategies.
 */

export { CircuitBreaker } from "./circuit-breaker.js";
export { KeyPool } from "./key-pool.js";
export { formatModelId, normalizeModelSelection, parseModelId } from "./model-id.js";
export { ModelRouter } from "./router.js";
export type {
  CircuitBreakerConfig,
  CircuitState,
  CompletionRequest,
  CompletionResponse,
  FailoverAction,
  FinishReason,
  KeyConfig,
  Message,
  ModelId,
  ModelProvider,
  ModelRef,
  ModelRouterConfig,
  ModelSelection,
  ProviderConfig,
  ProviderErrorCategory,
  ProviderMetrics,
  ResponseFormat,
  RoutingContext,
  RoutingStrategy,
  StreamChunk,
  StreamChunkType,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  UsageEvent,
} from "./types.js";
export { validateRouterConfig } from "./validation.js";

export const PACKAGE_NAME = "@templar/model-router" as const;
