/**
 * @templar/heartbeat
 *
 * Enhanced periodic agent wake-up system with configurable evaluator pipeline.
 *
 * Provides:
 * - Sequential evaluator pipeline with early-exit and criticality rules
 * - Drift-compensated recursive setTimeout timer
 * - Built-in evaluators: channel visibility, trigger check, reaction processing,
 *   stuck recovery, and memory promotion
 * - Bounded ring buffer diagnostics
 * - TemplarMiddleware integration + standalone public API
 */

// Clock
export { defaultClock } from "./clock.js";
// Config
export { resolveHeartbeatConfig } from "./config.js";
// Constants
export {
  DEFAULT_DIAGNOSTICS_BUFFER_SIZE,
  DEFAULT_EVALUATOR_TIMEOUT_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_PROMOTIONS_PER_TICK,
  DEFAULT_STALE_THRESHOLD_MS,
  PACKAGE_NAME,
} from "./constants.js";

// Built-in evaluators
export {
  clearReactions,
  createChannelVisibilityEvaluator,
  createMemoryPromotionEvaluator,
  createReactionProcessorEvaluator,
  createStuckRecoveryEvaluator,
  createTriggerCheckEvaluator,
  enqueueReaction,
  getReactionQueueSize,
} from "./evaluators/index.js";
// Middleware
export { createHeartbeatMiddleware, HeartbeatMiddleware } from "./middleware.js";
export type { PipelineOptions } from "./pipeline.js";
// Pipeline
export { runPipeline } from "./pipeline.js";
// Ring buffer utility
export { RingBuffer } from "./ring-buffer.js";
// Types
export type {
  ChannelVisibilityConfig,
  Clock,
  EvalResult,
  EvalResultKind,
  EvaluatorCriticality,
  HealthStatus,
  HeartbeatConfig,
  HeartbeatContext,
  HeartbeatEvaluator,
  HeartbeatStatus,
  MemoryPromotionConfig,
  ReactionHandler,
  ReactionProcessorConfig,
  ResolvedHeartbeatConfig,
  StuckRecoveryAction,
  StuckRecoveryConfig,
  TickResult,
  TriggerCheckConfig,
} from "./types.js";
// With-timeout utility
export { withTimeout } from "./with-timeout.js";
