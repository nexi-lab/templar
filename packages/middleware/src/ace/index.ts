import type { NexusClient } from "@nexus/sdk";
import { NexusAceMiddleware, validateAceConfig } from "./middleware.js";
import type { NexusAceConfig } from "./types.js";

/**
 * Create a NexusAceMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - ACE middleware configuration (all fields optional)
 * @returns A configured NexusAceMiddleware instance
 * @throws {AceConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createNexusAceMiddleware } from '@templar/middleware/ace';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const aceMiddleware = createNexusAceMiddleware(client, {
 *   enabled: { playbooks: true, trajectory: true, reflection: false },
 *   maxStrategiesInjected: 10,
 *   minStrategyConfidence: 0.6,
 * });
 * ```
 */
export function createNexusAceMiddleware(
  client: NexusClient,
  config: NexusAceConfig = {},
): NexusAceMiddleware {
  // Validation happens in the NexusAceMiddleware constructor
  return new NexusAceMiddleware(client, config);
}

// Re-export types and class
export { NexusAceMiddleware, validateAceConfig } from "./middleware.js";
export type {
  AceFeatureFlags,
  NexusAceConfig,
  ReflectionMode,
  ResolvedAceConfig,
} from "./types.js";
export { DEFAULT_ACE_CONFIG, DEFAULT_FEATURE_FLAGS } from "./types.js";
