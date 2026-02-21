/**
 * Reaction processor evaluator — optional criticality.
 *
 * Processes queued event reactions with handler dispatch.
 * Reactions are in-memory; no Nexus dependency.
 */

import type { HeartbeatContext, HeartbeatEvaluator, ReactionProcessorConfig } from "../types.js";

// In-memory reaction queue
const reactionQueue: Array<{ eventId: string; metadata?: Record<string, unknown> }> = [];

/**
 * Enqueue a reaction for processing on the next heartbeat tick.
 */
export function enqueueReaction(eventId: string, metadata?: Record<string, unknown>): void {
  reactionQueue.push({ eventId, ...(metadata ? { metadata } : {}) });
}

/**
 * Clear all pending reactions.
 */
export function clearReactions(): void {
  reactionQueue.length = 0;
}

/**
 * Get current reaction queue length (for testing).
 */
export function getReactionQueueSize(): number {
  return reactionQueue.length;
}

export function createReactionProcessorEvaluator(
  config: ReactionProcessorConfig,
): HeartbeatEvaluator {
  return {
    name: "reaction-processor",
    criticality: "optional",
    async evaluate(_context: HeartbeatContext) {
      const start = Date.now();
      const processed: string[] = [];
      const errors: string[] = [];

      // Drain the queue
      const batch = reactionQueue.splice(0, reactionQueue.length);

      for (const reaction of batch) {
        const handler = config.handlers[reaction.eventId];
        if (handler) {
          try {
            await handler(reaction.eventId, reaction.metadata);
            processed.push(reaction.eventId);
          } catch (error: unknown) {
            errors.push(
              `${reaction.eventId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      return {
        evaluator: "reaction-processor",
        kind: "action" as const,
        passed: errors.length === 0,
        earlyExit: false,
        latencyMs: Date.now() - start,
        metadata: {
          processedCount: processed.length,
          errorCount: errors.length,
          ...(errors.length > 0 ? { errors } : {}),
        },
      };
    },
  };
}
