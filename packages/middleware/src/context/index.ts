import type { ContextHydrationConfig } from "@templar/core";
import { ContextHydrator } from "./middleware.js";
import type { ContextHydratorDeps } from "./types.js";
import { validateContextHydrationConfig } from "./validation.js";

/**
 * Create a ContextHydrator middleware instance.
 *
 * @param config - Context hydration configuration
 * @param deps - External dependencies (NexusClient, ToolExecutor)
 * @returns A configured ContextHydrator instance
 * @throws {ContextHydrationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { createContextHydrator } from '@templar/middleware/context';
 *
 * const hydrator = createContextHydrator(
 *   {
 *     sources: [
 *       { type: 'memory_query', query: '{{task.description}}', limit: 5 },
 *     ],
 *     maxHydrationTimeMs: 2000,
 *   },
 *   { nexus: nexusClient },
 * );
 * ```
 */
export function createContextHydrator(
  config: ContextHydrationConfig,
  deps: ContextHydratorDeps,
): ContextHydrator {
  validateContextHydrationConfig(config);
  return new ContextHydrator(config, deps);
}

// Re-export class, types, template, resolvers, validation
export { ContextHydrator } from "./middleware.js";
export {
  LinkedResourceResolver,
  McpToolResolver,
  MemoryQueryResolver,
  WorkspaceSnapshotResolver,
} from "./resolvers/index.js";
export { interpolateTemplate } from "./template.js";
export type { ContextHydratorDeps, ContextSourceResolver } from "./types.js";
export { DEFAULT_HYDRATION_CONFIG } from "./types.js";
export { validateContextHydrationConfig } from "./validation.js";
