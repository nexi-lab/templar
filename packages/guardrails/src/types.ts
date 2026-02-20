import type { ModelRequest, ModelResponse, ToolRequest, ToolResponse } from "@templar/core";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Guard context — provided to each guard's validate()
// ---------------------------------------------------------------------------

export interface GuardContext {
  readonly hook: "model" | "tool" | "turn";
  readonly request?: ModelRequest | ToolRequest;
  readonly response: ModelResponse | ToolResponse | unknown;
  readonly attempt: number;
  readonly previousIssues: readonly GuardIssue[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Guard result types
// ---------------------------------------------------------------------------

export interface GuardIssue {
  readonly guard: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code: string;
  readonly severity: "error" | "warning";
}

export interface GuardResult {
  readonly valid: boolean;
  readonly issues: readonly GuardIssue[];
}

export interface AggregatedGuardResult {
  readonly valid: boolean;
  readonly issues: readonly GuardIssue[];
  readonly guardResults: readonly GuardTimingResult[];
}

export interface GuardTimingResult {
  readonly guard: string;
  readonly durationMs: number;
  readonly valid: boolean;
}

// ---------------------------------------------------------------------------
// Guard interface
// ---------------------------------------------------------------------------

export interface Guard {
  readonly name: string;
  validate(context: GuardContext): GuardResult | Promise<GuardResult>;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export type OnFailureMode = "retry" | "throw" | "warn";
export type ExecutionStrategy = "sequential" | "parallel";

export interface GuardrailsConfig {
  readonly guards: readonly Guard[];
  readonly schema?: z.ZodType;
  readonly onFailure?: OnFailureMode;
  readonly maxRetries?: number;
  readonly executionStrategy?: ExecutionStrategy;
  readonly validationTimeoutMs?: number;
  readonly validateModelCalls?: boolean;
  readonly validateToolCalls?: boolean;
  readonly validateTurns?: boolean;
  readonly onWarning?: (issues: readonly GuardIssue[]) => void;
}

// ---------------------------------------------------------------------------
// Resolved configuration (all fields required)
// ---------------------------------------------------------------------------

export interface ResolvedGuardrailsConfig {
  readonly guards: readonly Guard[];
  readonly schema: z.ZodType | undefined;
  readonly onFailure: OnFailureMode;
  readonly maxRetries: number;
  readonly executionStrategy: ExecutionStrategy;
  readonly validationTimeoutMs: number;
  readonly validateModelCalls: boolean;
  readonly validateToolCalls: boolean;
  readonly validateTurns: boolean;
  readonly onWarning: ((issues: readonly GuardIssue[]) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Validation metrics — attached to response metadata
// ---------------------------------------------------------------------------

export interface ValidationMetrics {
  readonly hook: "model" | "tool" | "turn";
  readonly totalAttempts: number;
  readonly totalDurationMs: number;
  readonly passed: boolean;
  readonly guardResults: readonly GuardTimingResult[];
}

// ---------------------------------------------------------------------------
// Schema validation result (internal)
// ---------------------------------------------------------------------------

export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly issues: readonly GuardIssue[];
}
