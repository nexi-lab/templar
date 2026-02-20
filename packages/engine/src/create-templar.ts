import type { TemplarConfig, TemplarMiddleware } from "@templar/core";
import { getErrorCause, getErrorMessage, TemplarConfigError } from "@templar/errors";
import { createContextEnvMiddleware } from "./context-env-middleware.js";
import { IterationGuard } from "./iteration-guard.js";
import { getMiddlewareWrapper } from "./middleware-wrapper.js";
import {
  validateAgentType,
  validateExecutionLimits,
  validateManifest,
  validateNexusClient,
} from "./validation.js";

/**
 * Placeholder for createDeepAgent from 'deepagents' package.
 * Will be replaced with actual import when peerDependency is available.
 *
 * When the stub is active, createTemplar() logs a warning and returns the
 * validated/wrapped config. This ensures callers notice the stub without
 * breaking validation and middleware wrapping flows.
 */
let _deepAgentsIntegrated = false;
function createDeepAgent(config: unknown): unknown {
  if (!_deepAgentsIntegrated) {
    console.warn(
      "[@templar/engine] deepagents package is not yet integrated. " +
        "createTemplar() returns validated config only (no agent created).",
    );
  }
  return config;
}

/** @internal Test-only: pretend deepagents is integrated (suppresses stub warning). */
export function _setDeepAgentsIntegrated(value: boolean): void {
  _deepAgentsIntegrated = value;
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
 * import { createTemplar } from '@templar/engine';
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
  validateExecutionLimits(config.executionLimits);

  // Create iteration guard for hard execution limits
  const iterationGuard = new IterationGuard(config.executionLimits);

  // Auto-inject ContextEnvMiddleware as the first middleware (#128)
  // This builds TemplarRuntimeContext from SessionContext at session start.
  const contextEnvMiddleware = createContextEnvMiddleware(
    config.zoneId !== undefined ? { zoneId: config.zoneId } : undefined,
  );

  // Merge plugin middleware with explicitly provided middleware
  // Context env middleware first, then plugin (ordered by trust tier), then explicit
  const pluginMiddleware = config.pluginAssembly?.middleware ?? [];
  let middleware = [
    contextEnvMiddleware as unknown,
    ...pluginMiddleware,
    ...(config.middleware ?? []),
  ];

  // Wrap middleware with OTel tracing when @templar/telemetry has registered a wrapper
  const middlewareWrapper = getMiddlewareWrapper();
  if (middlewareWrapper !== undefined) {
    const wrapper = middlewareWrapper;
    middleware = middleware.map((mw) =>
      typeof mw === "object" && mw !== null && "name" in mw ? wrapper(mw as TemplarMiddleware) : mw,
    );
  }

  // Create DeepAgent with merged config and iteration guard
  try {
    return createDeepAgent({
      ...config,
      middleware,
      _iterationGuard: iterationGuard,
    });
  } catch (error) {
    throw new TemplarConfigError(`Failed to create Templar agent: ${getErrorMessage(error)}`, {
      cause: getErrorCause(error),
    });
  }
}
