import { TemplarConfigError } from "@templar/errors";
import type { TemplarConfig } from "./types.js";
import { validateAgentType, validateManifest, validateNexusClient } from "./validation.js";

export const PACKAGE_NAME = "@templar/core" as const;

// Export channel loading infrastructure
export { ChannelRegistry } from "./channel-registry.js";
export { isChannelAdapter } from "./type-guards.js";
// Export types
export type {
  AgentManifest,
  ChannelAdapter,
  ChannelCapabilities,
  ChannelConfig,
  DeepAgentConfig,
  MessageHandler,
  MiddlewareConfig,
  ModelConfig,
  NexusClient,
  OutboundMessage,
  PermissionConfig,
  TemplarConfig,
  TemplarMiddleware,
  ToolConfig,
} from "./types.js";
// Export validation functions
export {
  validateAgentType,
  validateManifest,
  validateNexusClient,
} from "./validation.js";

/**
 * Placeholder for getDefaultNexusMiddleware
 * Will be implemented in @templar/middleware package
 */
function getDefaultNexusMiddleware(_client: unknown): unknown[] {
  // TODO: Implement when @templar/middleware is ready
  return [];
}

/**
 * Placeholder for createDeepAgent from 'deepagents' package
 * Will be replaced with actual import when peerDependency is available
 */
function createDeepAgent(config: unknown): unknown {
  // TODO: Replace with actual import from 'deepagents'
  return config;
}

/**
 * Creates a Templar agent instance with DeepAgents.js
 *
 * This is a thin wrapper around createDeepAgent that:
 * - Validates configuration
 * - Injects Nexus middleware if nexus client provided
 * - Provides Templar-specific defaults
 *
 * @param config - Templar configuration
 * @returns Compiled LangGraph agent (same as createDeepAgent)
 * @throws {TemplarConfigError} if configuration is invalid
 * @throws {NexusClientError} if nexus client is not properly initialized
 * @throws {ManifestValidationError} if manifest structure is invalid
 *
 * @example
 * ```typescript
 * import { createTemplar } from '@templar/core';
 *
 * // Basic usage
 * const agent = createTemplar({
 *   model: 'gpt-4',
 *   agentType: 'high'
 * });
 *
 * // With Nexus middleware
 * const agentWithNexus = createTemplar({
 *   model: 'gpt-4',
 *   nexus: nexusClient,
 *   agentType: 'high'
 * });
 *
 * // With manifest
 * const agentWithManifest = createTemplar({
 *   model: 'gpt-4',
 *   manifest: {
 *     name: 'my-agent',
 *     version: '1.0.0',
 *     description: 'My AI agent'
 *   }
 * });
 * ```
 */
export function createTemplar(config: TemplarConfig): unknown {
  // Validate configuration
  validateAgentType(config.agentType);
  validateNexusClient(config.nexus);
  validateManifest(config.manifest);

  // Inject Nexus middleware if nexus client provided
  const middleware = [
    ...(config.nexus ? getDefaultNexusMiddleware(config.nexus) : []),
    ...(config.middleware ?? []),
  ];

  // Create DeepAgent with merged config
  try {
    return createDeepAgent({
      ...config,
      middleware,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new TemplarConfigError(`Failed to create Templar agent: ${errorMessage}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
