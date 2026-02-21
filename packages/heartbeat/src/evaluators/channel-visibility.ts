/**
 * Channel visibility evaluator — required criticality.
 *
 * Determines if any channels are active. If none, signals earlyExit
 * to skip the rest of the pipeline.
 */

import type { ChannelVisibilityConfig, HeartbeatContext, HeartbeatEvaluator } from "../types.js";

export function createChannelVisibilityEvaluator(
  config: ChannelVisibilityConfig,
): HeartbeatEvaluator {
  return {
    name: "channel-visibility",
    criticality: "required",
    async evaluate(_context: HeartbeatContext) {
      const start = Date.now();
      const hasActiveChannels = config.activeChannels.length > 0;

      return {
        evaluator: "channel-visibility",
        kind: "check" as const,
        passed: hasActiveChannels,
        earlyExit: !hasActiveChannels,
        latencyMs: Date.now() - start,
        metadata: {
          activeChannelCount: config.activeChannels.length,
          ...(hasActiveChannels ? { channels: [...config.activeChannels] } : {}),
        },
      };
    },
  };
}
