import type { NexusClient } from "@nexus/sdk";
import { NexusMemoryMiddleware, validateMemoryConfig } from "./middleware.js";
import type { NexusMemoryConfig } from "./types.js";

/**
 * Create a NexusMemoryMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - Memory middleware configuration
 * @returns A configured NexusMemoryMiddleware instance
 * @throws {MemoryConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createNexusMemoryMiddleware } from '@templar/middleware/memory';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const memoryMiddleware = createNexusMemoryMiddleware(client, {
 *   scope: 'agent',
 *   injectionStrategy: 'session_start',
 *   autoSaveInterval: 5,
 * });
 * ```
 */
export function createNexusMemoryMiddleware(
  client: NexusClient,
  config: NexusMemoryConfig,
): NexusMemoryMiddleware {
  validateMemoryConfig(config);
  return new NexusMemoryMiddleware(client, config);
}

// Re-export types and class
export { NexusMemoryMiddleware, validateMemoryConfig } from "./middleware.js";
export type { InjectionStrategy, NexusMemoryConfig } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
