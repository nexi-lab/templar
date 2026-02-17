// ---------------------------------------------------------------------------
// Execution Limits & Loop Detection Types
// ---------------------------------------------------------------------------

/**
 * Configuration for loop detection (used by ExecutionGuardMiddleware).
 */
export interface LoopDetectionConfig {
  /** Enable loop detection (default: true) */
  readonly enabled?: boolean;
  /** Number of recent outputs to analyze (default: 5) */
  readonly windowSize?: number;
  /** Consecutive similar outputs to trigger detection (default: 3) */
  readonly repeatThreshold?: number;
  /** Maximum tool call cycle length to search for (default: 4) */
  readonly maxCycleLength?: number;
  /** Action when loop is detected (default: "stop") */
  readonly onDetected?: "warn" | "stop" | "error";
}

/**
 * Hard limits + smart detection config for agent execution.
 */
export interface ExecutionLimitsConfig {
  /** Hard cap on iterations per run (default: 25) */
  readonly maxIterations?: number;
  /** Wall-clock timeout in ms (default: 120_000 = 2 min) */
  readonly maxExecutionTimeMs?: number;
  /** Loop detection configuration */
  readonly loopDetection?: LoopDetectionConfig;
}

/**
 * Result of loop detection analysis.
 */
export interface LoopDetection {
  readonly type: "tool_cycle" | "output_repeat";
  /** For tool_cycle: the repeating tool call pattern */
  readonly cyclePattern?: readonly string[];
  /** Number of repetitions detected */
  readonly repetitions: number;
  /** Window of recent outputs analyzed */
  readonly windowSize: number;
}

/**
 * Discriminated union of reasons an agent run stopped.
 */
export type StopReason =
  | { readonly kind: "completed" }
  | { readonly kind: "iteration_limit"; readonly count: number; readonly max: number }
  | { readonly kind: "timeout"; readonly elapsedMs: number; readonly maxMs: number }
  | { readonly kind: "loop_detected"; readonly detection: LoopDetection }
  | { readonly kind: "budget_exhausted" }
  | { readonly kind: "user_cancelled" };
