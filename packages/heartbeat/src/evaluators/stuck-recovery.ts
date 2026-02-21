/**
 * Stuck recovery evaluator — recommended criticality.
 *
 * Detects sessions that have been idle beyond a threshold
 * and triggers a recovery action.
 */

import { DEFAULT_STALE_THRESHOLD_MS } from "../constants.js";
import type { HeartbeatContext, HeartbeatEvaluator, StuckRecoveryConfig } from "../types.js";

export function createStuckRecoveryEvaluator(config: StuckRecoveryConfig): HeartbeatEvaluator {
  const thresholdMs = config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

  return {
    name: "stuck-recovery",
    criticality: "recommended",
    async evaluate(context: HeartbeatContext) {
      const start = Date.now();
      const elapsed = start - context.lastActivityTimestamp;
      const isStale = elapsed >= thresholdMs;

      if (!isStale) {
        return {
          evaluator: "stuck-recovery",
          kind: "action" as const,
          passed: true,
          earlyExit: false,
          latencyMs: Date.now() - start,
          metadata: {
            idleMs: elapsed,
            thresholdMs,
            stale: false,
          },
        };
      }

      // Session is stale — execute recovery action
      return {
        evaluator: "stuck-recovery",
        kind: "action" as const,
        passed: true,
        earlyExit: false,
        latencyMs: Date.now() - start,
        metadata: {
          idleMs: elapsed,
          thresholdMs,
          stale: true,
          action: config.action,
          recovered: true,
        },
      };
    },
  };
}
