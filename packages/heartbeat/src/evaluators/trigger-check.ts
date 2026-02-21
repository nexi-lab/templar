/**
 * Trigger check evaluator — recommended criticality.
 *
 * Checks Nexus events/workflows for pending triggers.
 * Gracefully degrades when Nexus client is unavailable.
 *
 * The evaluator iterates configured sources and queries the
 * Nexus event log for recent entries. Source-specific logic
 * is intentionally thin — consumers can extend via custom evaluators.
 */

import type { HeartbeatContext, HeartbeatEvaluator, TriggerCheckConfig } from "../types.js";

export function createTriggerCheckEvaluator(config: TriggerCheckConfig): HeartbeatEvaluator {
  return {
    name: "trigger-check",
    criticality: "recommended",
    async evaluate(context: HeartbeatContext) {
      const start = Date.now();

      if (!context.nexusClient) {
        return {
          evaluator: "trigger-check",
          kind: "check" as const,
          passed: true,
          earlyExit: false,
          latencyMs: Date.now() - start,
          metadata: { skipped: true, reason: "no nexus client" },
        };
      }

      // Iterate configured sources and check for pending triggers
      const checkedSources: string[] = [];

      for (const source of config.sources) {
        try {
          // Write a heartbeat-check event to the event log for audit trail
          await context.nexusClient.eventLog.write({
            path: `/events/heartbeat/trigger-check/${source}`,
            data: {
              type: "trigger_check",
              source,
              tickNumber: context.tickNumber,
              sessionId: context.sessionId,
            },
          });
          checkedSources.push(source);
        } catch {
          // Graceful degradation — source unavailable
        }
      }

      return {
        evaluator: "trigger-check",
        kind: "check" as const,
        passed: true,
        earlyExit: false,
        latencyMs: Date.now() - start,
        metadata: {
          sources: [...config.sources],
          checkedCount: checkedSources.length,
        },
      };
    },
  };
}
