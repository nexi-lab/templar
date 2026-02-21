/**
 * Sequential evaluator pipeline (Decision 3A).
 *
 * Runs evaluators in order with per-evaluator timeout (Decision 14A).
 * Applies criticality rules (Decision 8A) and early-exit (Decision 3A).
 */

import {
  HeartbeatEvaluatorFailedError,
  HeartbeatEvaluatorTimeoutError,
  HeartbeatPipelineFailedError,
} from "@templar/errors";
import type {
  Clock,
  EvalResult,
  HealthStatus,
  HeartbeatContext,
  HeartbeatEvaluator,
  TickResult,
} from "./types.js";
import { withTimeout } from "./with-timeout.js";

export interface PipelineOptions {
  readonly evaluators: readonly HeartbeatEvaluator[];
  readonly evaluatorTimeoutMs: number;
  readonly clock: Clock;
}

/**
 * Run the evaluator pipeline for a single tick.
 */
export async function runPipeline(
  context: HeartbeatContext,
  options: PipelineOptions,
): Promise<TickResult> {
  const { evaluators, evaluatorTimeoutMs, clock } = options;
  const tickStart = clock.now();
  const results: EvalResult[] = [];
  let stoppedEarly = false;
  let hasRequiredFailure = false;
  let hasRecommendedFailure = false;

  try {
    for (const evaluator of evaluators) {
      const evalStart = clock.now();
      let result: EvalResult;

      try {
        result = await withTimeout(evaluator.evaluate(context), evaluatorTimeoutMs, evaluator.name);
      } catch (error: unknown) {
        const latencyMs = clock.now() - evalStart;
        const isTimeout = error instanceof HeartbeatEvaluatorTimeoutError;

        result = {
          evaluator: evaluator.name,
          kind: "check",
          passed: false,
          earlyExit: false,
          latencyMs,
          error: isTimeout
            ? `Timeout after ${evaluatorTimeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error),
        };

        if (!isTimeout && !(error instanceof HeartbeatEvaluatorFailedError)) {
          // Wrap unexpected errors
          void new HeartbeatEvaluatorFailedError(
            evaluator.name,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }

      results.push(result);

      // Apply criticality rules (Decision 8A)
      if (!result.passed) {
        if (evaluator.criticality === "required") {
          hasRequiredFailure = true;
          stoppedEarly = true;
          break;
        }
        if (evaluator.criticality === "recommended") {
          hasRecommendedFailure = true;
        }
        // optional failures are silently collected
      }

      // Check early-exit signal (Decision 3A)
      if (result.earlyExit) {
        stoppedEarly = true;
        break;
      }
    }
  } catch (error: unknown) {
    throw new HeartbeatPipelineFailedError(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : undefined,
    );
  }

  const totalLatencyMs = clock.now() - tickStart;

  const health: HealthStatus = hasRequiredFailure
    ? "critical"
    : hasRecommendedFailure
      ? "degraded"
      : "healthy";

  return {
    tickNumber: context.tickNumber,
    timestamp: tickStart,
    results: Object.freeze(results),
    overallPassed: !hasRequiredFailure,
    totalLatencyMs,
    stoppedEarly,
    health,
  };
}
