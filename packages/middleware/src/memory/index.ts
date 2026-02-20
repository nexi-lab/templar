import type { NexusClient } from "@nexus/sdk";
import { NexusMemoryMiddleware, validateMemoryConfig } from "./middleware.js";
import type { FactExtractor, NexusMemoryConfig } from "./types.js";

/**
 * Create a NexusMemoryMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - Memory middleware configuration
 * @param extractor - Optional pluggable fact extractor (default: SimpleFactExtractor)
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
 * // Basic usage (SimpleFactExtractor)
 * const memoryMiddleware = createNexusMemoryMiddleware(client, {
 *   scope: 'agent',
 *   injectionStrategy: 'session_start',
 *   autoSaveInterval: 5,
 * });
 *
 * // With LLM-based extraction
 * import { LlmFactExtractor } from '@templar/middleware/memory';
 * const llmExtractor = new LlmFactExtractor(myModelCallFn);
 * const memoryMiddleware = createNexusMemoryMiddleware(client, {
 *   scope: 'agent',
 *   autoSave: { useLlmExtraction: true, deduplication: true },
 * }, llmExtractor);
 * ```
 */
export function createNexusMemoryMiddleware(
  client: NexusClient,
  config: NexusMemoryConfig,
  extractor?: FactExtractor,
): NexusMemoryMiddleware {
  validateMemoryConfig(config);
  return new NexusMemoryMiddleware(client, config, extractor);
}

// Re-export extractors
export { LlmFactExtractor } from "./extractor.js";
// Re-export middleware class and validation
export { NexusMemoryMiddleware, validateMemoryConfig } from "./middleware.js";
// Re-export parser
export { parseFacts } from "./parser.js";
export { SimpleFactExtractor } from "./simple-extractor.js";

// Re-export types
export type {
  AutoSaveConfig,
  ExtractedFact,
  FactExtractionContext,
  FactExtractor,
  FactTurnSummary,
  InjectionStrategy,
  MemoryCategory,
  ModelCallFn,
  NexusMemoryConfig,
} from "./types.js";
export { DEFAULT_AUTO_SAVE_CONFIG, DEFAULT_CONFIG } from "./types.js";
