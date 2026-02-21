/**
 * Memory promotion evaluator — optional criticality.
 *
 * Promotes important short-term memories to long-term via Nexus ACE.
 * Gracefully degrades when Nexus/ACE is unavailable.
 */

import { DEFAULT_MAX_PROMOTIONS_PER_TICK } from "../constants.js";
import type { HeartbeatContext, HeartbeatEvaluator, MemoryPromotionConfig } from "../types.js";

export function createMemoryPromotionEvaluator(
  config: MemoryPromotionConfig = {},
): HeartbeatEvaluator {
  const maxPromotions = config.maxPromotionsPerTick ?? DEFAULT_MAX_PROMOTIONS_PER_TICK;

  return {
    name: "memory-promotion",
    criticality: "optional",
    async evaluate(context: HeartbeatContext) {
      const start = Date.now();

      // Check if Nexus ACE is available
      const ace = context.nexusClient?.ace;
      if (!ace) {
        return {
          evaluator: "memory-promotion",
          kind: "action" as const,
          passed: true,
          earlyExit: false,
          latencyMs: Date.now() - start,
          metadata: { skipped: true, reason: "no ACE resource available" },
        };
      }

      let promotedCount = 0;

      try {
        // Query recent memories for promotion candidates
        const memories = await context.nexusClient?.memory.query({
          scope: "session",
          memory_type: "observation",
          limit: maxPromotions,
        });

        if (memories && Array.isArray(memories) && memories.length > 0) {
          // Promote each candidate to long-term storage
          for (const memory of memories.slice(0, maxPromotions)) {
            try {
              await context.nexusClient?.memory.store({
                content:
                  typeof memory === "object" && memory !== null && "content" in memory
                    ? String(memory.content)
                    : String(memory),
                scope: "agent",
                memory_type: "learned",
              });
              promotedCount++;
            } catch {
              // Individual promotion failure — continue with others
            }
          }
        }
      } catch {
        // Graceful degradation — memory query failed
      }

      return {
        evaluator: "memory-promotion",
        kind: "action" as const,
        passed: true,
        earlyExit: false,
        latencyMs: Date.now() - start,
        metadata: {
          promotedCount,
          maxPromotions,
        },
      };
    },
  };
}
