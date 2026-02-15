import { TemplarConfigError } from "@templar/errors";
import type { TemplarConfig, TemplarMiddleware } from "./types.js";
import { validateAgentType, validateManifest, validateNexusClient } from "./validation.js";

/**
 * Registered middleware wrapping function from @templar/telemetry.
 * Set via registerMiddlewareWrapper() when setupTelemetry() is called.
 */
let middlewareWrapper: ((mw: TemplarMiddleware) => TemplarMiddleware) | undefined;

/**
 * Register a middleware wrapping function (called by @templar/telemetry's setupTelemetry).
 *
 * This allows the telemetry package to hook into createTemplar() without
 * making createTemplar async or creating a circular dependency.
 */
export function registerMiddlewareWrapper(
  wrapper: (mw: TemplarMiddleware) => TemplarMiddleware,
): void {
  middlewareWrapper = wrapper;
}

/**
 * Unregister the middleware wrapper (called by shutdownTelemetry).
 */
export function unregisterMiddlewareWrapper(): void {
  middlewareWrapper = undefined;
}

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
  ChannelIdentity,
  ChannelIdentityConfig,
  ChannelModule,
  ContentBlock,
  ConversationContext,
  DeepAgentConfig,
  FileBlock,
  FileCapability,
  GroupCapability,
  IdentityCapability,
  IdentityConfig,
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
  RealTimeVoiceCapability,
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
  let middleware = [...(config.middleware ?? [])];

  // Wrap middleware with OTel tracing when @templar/telemetry has registered a wrapper
  if (middlewareWrapper !== undefined) {
    const wrapper = middlewareWrapper;
    middleware = middleware.map((mw) =>
      typeof mw === "object" && mw !== null && "name" in mw ? wrapper(mw as TemplarMiddleware) : mw,
    );
  }

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
