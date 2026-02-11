import type { NexusClient } from "@nexus/sdk";
import { NexusPermissionsMiddleware, validatePermissionsConfig } from "./middleware.js";
import type { NexusPermissionsConfig } from "./types.js";

/**
 * Create a NexusPermissionsMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - Permissions middleware configuration
 * @returns A configured NexusPermissionsMiddleware instance
 * @throws {PermissionConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createNexusPermissionsMiddleware } from '@templar/middleware/permissions';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const permissionsMiddleware = createNexusPermissionsMiddleware(client, {
 *   defaultPattern: 'deny',
 *   toolPermissions: {
 *     'web-search': 'ask',
 *     'calculator': 'allow',
 *   },
 *   progressiveAllowlist: true,
 *   onPermissionRequest: async (tool, context) => {
 *     // Prompt user for approval
 *     return 'allow';
 *   },
 * });
 * ```
 */
export function createNexusPermissionsMiddleware(
  client: NexusClient,
  config: NexusPermissionsConfig,
): NexusPermissionsMiddleware {
  validatePermissionsConfig(config);
  return new NexusPermissionsMiddleware(client, config);
}

// Re-export class and validation
export { NexusPermissionsMiddleware, validatePermissionsConfig } from "./middleware.js";

// Re-export types and constants
export type {
  CachedPermission,
  CircuitState,
  NexusPermissionsConfig,
  PermissionPattern,
} from "./types.js";
export { CIRCUIT_BREAKER_DEFAULTS, DEFAULT_PERMISSIONS_CONFIG } from "./types.js";
