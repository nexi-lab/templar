/**
 * @templar/collaboration — Multi-agent collaboration middleware
 *
 * Three middleware components for the DeepAgents middleware chain:
 * - ReactionMiddleware: Event-triggered agent responses
 * - VoiceEvolutionMiddleware: Memory-derived personality drift
 * - DistillationMiddleware: Post-conversation memory extraction
 *
 * @example
 * ```typescript
 * import { createReactionMiddleware } from "@templar/collaboration/reaction";
 * import { createVoiceEvolutionMiddleware } from "@templar/collaboration/voice";
 * import { createDistillationMiddleware } from "@templar/collaboration/distillation";
 * ```
 */

export type {
  DistillationConfig,
  DistillationTrigger,
  ExtractedMemory,
  ExtractionContext,
  MemoryExtractor,
  ResolvedDistillationConfig,
  TurnSummary,
} from "./distillation/index.js";
// Distillation
export {
  createDistillationMiddleware,
  DEFAULT_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_SCOPE,
  DefaultMemoryExtractor,
  DistillationMiddleware,
  resolveDistillationConfig,
} from "./distillation/index.js";
export type {
  EventSource,
  NexusEvent,
  ReactionConfig,
  ReactionPattern,
  ResolvedReactionConfig,
} from "./reaction/index.js";
// Reaction
export {
  createEventMatcher,
  createReactionMiddleware,
  DEFAULT_POLL_INTERVAL_MS,
  InMemoryEventSource,
  matchesFilters,
  PollingEventSource,
  ReactionMiddleware,
  resolveReactionConfig,
} from "./reaction/index.js";
export type {
  ModifierBuilder,
  PersonalityModifier,
  ResolvedVoiceEvolutionConfig,
  VoiceEvolutionConfig,
} from "./voice/index.js";
// Voice
export {
  createVoiceEvolutionMiddleware,
  DEFAULT_MAX_DRIFT,
  DEFAULT_MEMORY_QUERY_SCOPE,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_UPDATE_INTERVAL_MS,
  ModifierCache,
  resolveVoiceEvolutionConfig,
  VoiceEvolutionMiddleware,
} from "./voice/index.js";
