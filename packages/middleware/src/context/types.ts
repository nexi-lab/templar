/**
 * Internal types and defaults for the context hydrator middleware (#59).
 */

import type { NexusClient } from "@nexus/sdk";
import type { HydrationTemplateVars, ResolvedContextSource, ToolExecutor } from "@templar/core";

/**
 * Strategy interface for resolving a single context source.
 * Each source type (MCP tool, memory, workspace, linked resource)
 * implements this interface.
 */
export interface ContextSourceResolver {
  readonly type: string;
  resolve(
    params: Record<string, unknown>,
    vars: HydrationTemplateVars,
    signal?: AbortSignal,
  ): Promise<ResolvedContextSource>;
}

/**
 * External dependencies injected into the ContextHydrator.
 * Each is optional — the hydrator skips sources whose deps are missing.
 */
export interface ContextHydratorDeps {
  readonly nexus?: NexusClient;
  readonly toolExecutor?: ToolExecutor;
}

/**
 * Default configuration values.
 */
export const DEFAULT_HYDRATION_CONFIG = {
  maxHydrationTimeMs: 2000,
  maxContextChars: 20_000,
  defaultPerSourceTimeoutMs: 1500,
  failureStrategy: "continue",
} as const;
