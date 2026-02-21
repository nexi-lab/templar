/**
 * Type definitions for @templar/heartbeat.
 */

import type { NexusClient } from "@nexus/sdk";
import type { Clock } from "@templar/core";

// Re-export Clock from core for backwards compatibility
export type { Clock } from "@templar/core";

// ---------------------------------------------------------------------------
// Evaluator criticality (Decision 8A)
// ---------------------------------------------------------------------------

export type EvaluatorCriticality = "required" | "recommended" | "optional";

// ---------------------------------------------------------------------------
// Evaluator result kind (Decision 2A — unified with typed results)
// ---------------------------------------------------------------------------

export type EvalResultKind = "check" | "action";

// ---------------------------------------------------------------------------
// Core evaluator interface (Decision 2A)
// ---------------------------------------------------------------------------

export interface HeartbeatEvaluator {
  readonly name: string;
  readonly criticality: EvaluatorCriticality;
  evaluate(context: HeartbeatContext): Promise<EvalResult>;
}

// ---------------------------------------------------------------------------
// Evaluation context passed to each evaluator
// ---------------------------------------------------------------------------

export interface HeartbeatContext {
  readonly sessionId: string;
  readonly agentId?: string;
  readonly tickNumber: number;
  readonly lastActivityTimestamp: number;
  readonly intervalMs: number;
  readonly nexusClient?: NexusClient;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Evaluation result
// ---------------------------------------------------------------------------

export interface EvalResult {
  readonly evaluator: string;
  readonly kind: EvalResultKind;
  readonly passed: boolean;
  readonly earlyExit: boolean;
  readonly latencyMs: number;
  readonly metadata?: Record<string, unknown>;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Pipeline tick result
// ---------------------------------------------------------------------------

export interface TickResult {
  readonly tickNumber: number;
  readonly timestamp: number;
  readonly results: readonly EvalResult[];
  readonly overallPassed: boolean;
  readonly totalLatencyMs: number;
  readonly stoppedEarly: boolean;
  readonly health: HealthStatus;
}

export type HealthStatus = "healthy" | "degraded" | "critical";

// ---------------------------------------------------------------------------
// Heartbeat status (returned by middleware.status())
// ---------------------------------------------------------------------------

export interface HeartbeatStatus {
  readonly running: boolean;
  readonly tickNumber: number;
  readonly lastActivityTimestamp: number;
  readonly health: HealthStatus;
  readonly evaluatorCount: number;
}

// ---------------------------------------------------------------------------
// Configuration (Decision 5A — ms only, Decision 16A — fixed interval)
// ---------------------------------------------------------------------------

export interface HeartbeatConfig {
  readonly intervalMs?: number;
  readonly evaluators?: readonly HeartbeatEvaluator[];
  readonly evaluatorTimeoutMs?: number;
  readonly diagnosticsBufferSize?: number;
  readonly nexusClient?: NexusClient;
  readonly clock?: Clock;
  readonly onTick?: (result: TickResult) => void;
}

export interface ResolvedHeartbeatConfig {
  readonly intervalMs: number;
  readonly evaluators: readonly HeartbeatEvaluator[];
  readonly evaluatorTimeoutMs: number;
  readonly diagnosticsBufferSize: number;
  readonly nexusClient?: NexusClient;
  readonly clock: Clock;
  readonly onTick?: (result: TickResult) => void;
}

// ---------------------------------------------------------------------------
// Evaluator-specific config types
// ---------------------------------------------------------------------------

export interface ChannelVisibilityConfig {
  readonly activeChannels: readonly string[];
}

export interface TriggerCheckConfig {
  readonly sources: readonly string[];
}

export type ReactionHandler = (
  eventId: string,
  metadata?: Record<string, unknown>,
) => Promise<void>;

export interface ReactionProcessorConfig {
  readonly handlers: Readonly<Record<string, ReactionHandler>>;
}

export type StuckRecoveryAction = "summarize_and_restart" | "notify";

export interface StuckRecoveryConfig {
  readonly staleThresholdMs?: number;
  readonly action: StuckRecoveryAction;
}

export interface MemoryPromotionConfig {
  readonly maxPromotionsPerTick?: number;
}
