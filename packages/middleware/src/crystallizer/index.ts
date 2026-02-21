/**
 * @templar/middleware/crystallizer
 *
 * Tool pattern crystallization middleware (#164).
 * Observes tool usage patterns across sessions and auto-creates
 * reusable composite tool artifacts when patterns repeat.
 */

import type { NexusClient } from "@nexus/sdk";
import { CrystallizerMiddleware } from "./middleware.js";
import type { CrystallizerConfig } from "./types.js";

// Re-export public API
export { CrystallizerMiddleware, validateCrystallizerConfig } from "./middleware.js";
export { calculatePatternSuccessRate, mineFrequentSequences } from "./pattern-mining.js";
export type {
  CrystallizerConfig,
  CrystallizerFeatureFlags,
  MinedPattern,
  ResolvedCrystallizerConfig,
  SessionSequence,
  ToolCallRecord,
} from "./types.js";
export {
  DEFAULT_CRYSTALLIZER_CONFIG,
  DEFAULT_CRYSTALLIZER_FEATURE_FLAGS,
} from "./types.js";

/**
 * Factory function for creating a CrystallizerMiddleware instance.
 *
 * @param client - Nexus SDK client
 * @param config - Optional crystallizer configuration
 * @returns Configured CrystallizerMiddleware instance
 *
 * @example
 * ```typescript
 * import { createCrystallizerMiddleware } from "@templar/middleware/crystallizer";
 *
 * const crystallizer = createCrystallizerMiddleware(nexusClient, {
 *   minUses: 3,
 *   autoApprove: true,
 * });
 * ```
 */
export function createCrystallizerMiddleware(
  client: NexusClient,
  config: CrystallizerConfig = {},
): CrystallizerMiddleware {
  return new CrystallizerMiddleware(client, config);
}
