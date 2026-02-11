import { TemplarConfigError } from "@templar/errors";
import type { TemplarConfig } from "./types.js";
import { validateAgentType, validateManifest, validateNexusClient } from "./validation.js";

export const PACKAGE_NAME = "@templar/core" as const;

// Export block utilities
export { coalesceBlocks, splitText } from "./block-utils.js";
// Export channel loading infrastructure
export { CapabilityGuard } from "./capability-guard.js";
export { type ChannelLoadOptions, ChannelRegistry } from "./channel-registry.js";
export { hashConfig } from "./config-hash.js";
export { isChannelAdapter, isChannelCapabilities } from "./type-guards.js";
// Export types
export type {
  AgentManifest,
  Button,
  ButtonBlock,
  ButtonCapability,
  CapabilityKey,
  ChannelAdapter,
  ChannelCapabilities,
  ChannelConfig,
  ChannelModule,
  ContentBlock,
  DeepAgentConfig,
  FileBlock,
  FileCapability,
  GroupCapability,
  ImageBlock,
  ImageCapability,
  InboundMessage,
  MessageHandler,
  MiddlewareConfig,
  ModelConfig,
  NexusClient,
  OutboundMessage,
  PermissionConfig,
  ReactionCapability,
  ReadReceiptCapability,
  RichTextCapability,
  SessionContext,
  TemplarConfig,
  TemplarMiddleware,
  TextBlock,
  TextCapability,
  ThreadCapability,
  ToolConfig,
  TurnContext,
  TypingIndicatorCapability,
  VoiceMessageCapability,
} from "./types.js";
export { BLOCK_TYPE_TO_CAPABILITY } from "./types.js";
// Export validation functions
export {
  validateAgentType,
  validateManifest,
  validateNexusClient,
} from "./validation.js";

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
 * - Merges user-provided middleware
 * - Provides Templar-specific defaults
 *
 * Note: Nexus middleware (memory, pay, etc.) is passed explicitly
 * via config.middleware. Use createNexusMemoryMiddleware() from
 * @templar/middleware to create memory middleware.
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
 * // With explicit middleware
 * const agentWithMemory = createTemplar({
 *   model: 'gpt-4',
 *   agentType: 'high',
 *   middleware: [memoryMiddleware],
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

  // Middleware is always explicitly provided via config
  const middleware = [...(config.middleware ?? [])];

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
