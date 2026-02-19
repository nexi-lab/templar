/**
 * Types for the Nexus ACE (Adaptive Context Engine) API
 *
 * Covers: Trajectories, Playbooks, Reflection, Curation, Consolidation, Feedback
 */

// ============================================================================
// TRAJECTORY TYPES
// ============================================================================

/** Step type within a trajectory */
export type TrajectoryStepType = "action" | "decision" | "observation" | "tool_call" | "error";

/** Trajectory status */
export type TrajectoryStatus = "active" | "success" | "failure" | "partial" | "cancelled";

/** Parameters to start a new trajectory */
export interface StartTrajectoryParams {
  readonly task_description: string;
  readonly task_type?: string;
  readonly parent_trajectory_id?: string;
  readonly metadata?: Record<string, unknown>;
  readonly path?: string;
}

/** Response from starting a trajectory */
export interface StartTrajectoryResponse {
  readonly trajectory_id: string;
  readonly status: string;
}

/** Parameters to log a step in a trajectory */
export interface LogStepParams {
  readonly trajectory_id: string;
  readonly step_type: TrajectoryStepType;
  readonly description: string;
  readonly result?: unknown;
  readonly metadata?: Record<string, unknown>;
}

/** Parameters to complete a trajectory */
export interface CompleteTrajectoryParams {
  readonly trajectory_id: string;
  readonly status: TrajectoryStatus;
  readonly success_score?: number;
  readonly error_message?: string;
  readonly metrics?: Record<string, unknown>;
}

/** Query parameters for listing trajectories */
export interface QueryTrajectoriesParams {
  readonly agent_id?: string;
  readonly task_type?: string;
  readonly status?: TrajectoryStatus;
  readonly limit?: number;
  readonly offset?: number;
  readonly path?: string;
}

/** A trajectory entry from the API */
export interface TrajectoryEntry {
  readonly trajectory_id: string;
  readonly task_description: string;
  readonly task_type?: string;
  readonly status: TrajectoryStatus;
  readonly steps: readonly TrajectoryStep[];
  readonly success_score?: number;
  readonly error_message?: string;
  readonly metrics?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly created_at: string;
  readonly completed_at?: string;
}

/** A single step within a trajectory */
export interface TrajectoryStep {
  readonly step_type: TrajectoryStepType;
  readonly description: string;
  readonly result?: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: string;
}

/** Response from querying trajectories */
export interface QueryTrajectoriesResponse {
  readonly trajectories: readonly TrajectoryEntry[];
  readonly total: number;
}

// ============================================================================
// PLAYBOOK TYPES
// ============================================================================

/** Playbook scope */
export type PlaybookScope = "agent" | "user" | "zone" | "global";

/** Playbook visibility */
export type PlaybookVisibility = "private" | "shared" | "public";

/** A strategy within a playbook */
export interface PlaybookStrategy {
  readonly description: string;
  readonly confidence: number;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Parameters to create a playbook */
export interface CreatePlaybookParams {
  readonly name: string;
  readonly description?: string;
  readonly scope: PlaybookScope;
  readonly visibility?: PlaybookVisibility;
  readonly initial_strategies?: readonly PlaybookStrategy[];
}

/** Response from creating a playbook */
export interface CreatePlaybookResponse {
  readonly playbook_id: string;
  readonly status: string;
}

/** Parameters to update a playbook */
export interface UpdatePlaybookParams {
  readonly strategies?: readonly PlaybookStrategy[];
  readonly metadata?: Record<string, unknown>;
  readonly increment_version?: boolean;
}

/** Parameters to record playbook usage */
export interface PlaybookUsageParams {
  readonly playbook_id: string;
  readonly success: boolean;
  readonly improvement_score?: number;
}

/** Query parameters for listing playbooks */
export interface QueryPlaybooksParams {
  readonly scope?: PlaybookScope;
  readonly name_pattern?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** A playbook entry from the API */
export interface PlaybookEntry {
  readonly playbook_id: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: PlaybookScope;
  readonly visibility: PlaybookVisibility;
  readonly strategies: readonly PlaybookStrategy[];
  readonly version: number;
  readonly usage_count: number;
  readonly metadata?: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Response from querying playbooks */
export interface QueryPlaybooksResponse {
  readonly playbooks: readonly PlaybookEntry[];
  readonly total: number;
}

// ============================================================================
// REFLECTION TYPES
// ============================================================================

/** Parameters for a reflection request */
export interface ReflectParams {
  readonly trajectory_id: string;
  readonly context?: Record<string, unknown>;
  readonly reflection_prompt?: string;
}

/** Response from a reflection operation */
export interface ReflectionResult {
  readonly memory_id: string;
  readonly trajectory_id: string;
  readonly helpful_strategies: readonly string[];
  readonly harmful_patterns: readonly string[];
  readonly observations: readonly string[];
  readonly confidence: number;
}

// ============================================================================
// CURATION TYPES
// ============================================================================

/** Parameters for a curation request */
export interface CurateParams {
  readonly playbook_id: string;
  readonly reflection_memory_ids: readonly string[];
  readonly merge_threshold?: number;
}

/** Parameters for bulk curation */
export interface CurateBulkParams {
  readonly playbook_id: string;
  readonly trajectory_ids: readonly string[];
}

/** Response from a curation operation */
export interface CurationResult {
  readonly playbook_id: string;
  readonly strategies_added: number;
  readonly strategies_merged: number;
  readonly strategies_total: number;
}

// ============================================================================
// CONSOLIDATION TYPES
// ============================================================================

/** Parameters for a consolidation request */
export interface ConsolidateParams {
  readonly memory_ids?: readonly string[];
  readonly beta?: number;
  readonly lambda_decay?: number;
  readonly affinity_threshold?: number;
  readonly importance_max?: number;
  readonly memory_type?: string;
  readonly namespace?: string;
  readonly limit?: number;
}

/** Response from a consolidation operation */
export interface ConsolidationResult {
  readonly clusters_formed: number;
  readonly total_consolidated: number;
  readonly archived_count: number;
  readonly results: readonly Record<string, unknown>[];
}

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

/** Feedback type */
export type FeedbackType = "human" | "monitoring" | "ab_test" | "production";

/** Effective score calculation strategy */
export type ScoreStrategy = "latest" | "average" | "weighted";

/** Parameters to add feedback */
export interface AddFeedbackParams {
  readonly trajectory_id: string;
  readonly feedback_type: FeedbackType;
  readonly score: number;
  readonly source?: string;
  readonly message?: string;
  readonly metrics?: Record<string, unknown>;
}

/** Response from adding feedback */
export interface AddFeedbackResponse {
  readonly feedback_id: string;
  readonly status: string;
}

/** A feedback entry */
export interface FeedbackEntry {
  readonly feedback_id: string;
  readonly trajectory_id: string;
  readonly feedback_type: FeedbackType;
  readonly score: number;
  readonly source?: string;
  readonly message?: string;
  readonly metrics?: Record<string, unknown>;
  readonly created_at: string;
}

/** Parameters to get effective score */
export interface EffectiveScoreParams {
  readonly trajectory_id: string;
  readonly strategy?: ScoreStrategy;
}

/** Response with effective score */
export interface EffectiveScoreResponse {
  readonly trajectory_id: string;
  readonly effective_score: number;
  readonly strategy: ScoreStrategy;
}

/** Parameters to mark trajectory for relearning */
export interface RelearnParams {
  readonly trajectory_id: string;
  readonly reason?: string;
  readonly priority?: number;
}

/** Response from listing trajectory feedback */
export interface TrajectoryFeedbackResponse {
  readonly trajectory_id: string;
  readonly feedbacks: readonly FeedbackEntry[];
  readonly total: number;
}
