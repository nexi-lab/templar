/**
 * Context hydration types — deterministic context pre-loading (#59)
 *
 * These types define the configuration and result shapes for the
 * ContextHydrator middleware, which resolves context sources in parallel
 * before the agent's first LLM call.
 */

// ---------------------------------------------------------------------------
// Tool Executor — generic interface for pre-executing tools
// ---------------------------------------------------------------------------

/**
 * Generic interface for executing tools during context hydration.
 * Decouples the hydrator from any specific MCP client implementation.
 */
export interface ToolExecutor {
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Template Variables
// ---------------------------------------------------------------------------

/**
 * Template variables available during hydration for `{{key}}` interpolation.
 */
export interface HydrationTemplateVars {
  readonly task?: { readonly description?: string; readonly id?: string };
  readonly workspace?: { readonly root?: string };
  readonly agent?: { readonly id?: string };
  readonly user?: { readonly id?: string };
  readonly session?: { readonly id?: string };
}

// ---------------------------------------------------------------------------
// Context Source Config (discriminated union)
// ---------------------------------------------------------------------------

export interface McpToolSourceConfig {
  readonly type: "mcp_tool";
  readonly tool: string;
  readonly args?: Record<string, string>;
  readonly maxChars?: number;
  readonly timeoutMs?: number;
}

export interface WorkspaceSnapshotSourceConfig {
  readonly type: "workspace_snapshot";
  readonly mode?: "latest" | "files_only";
  readonly maxChars?: number;
  readonly timeoutMs?: number;
}

export interface MemoryQuerySourceConfig {
  readonly type: "memory_query";
  readonly query: string;
  readonly limit?: number;
  readonly maxChars?: number;
  readonly timeoutMs?: number;
}

export interface LinkedResourceSourceConfig {
  readonly type: "linked_resource";
  readonly urls: readonly string[];
  readonly maxChars?: number;
  readonly timeoutMs?: number;
}

/**
 * Discriminated union of all context source configurations.
 */
export type ContextSourceConfig =
  | McpToolSourceConfig
  | WorkspaceSnapshotSourceConfig
  | MemoryQuerySourceConfig
  | LinkedResourceSourceConfig;

// ---------------------------------------------------------------------------
// Hydration Config (top-level, goes in AgentManifest)
// ---------------------------------------------------------------------------

/**
 * Top-level hydration configuration.
 *
 * @example
 * ```yaml
 * context:
 *   maxHydrationTimeMs: 2000
 *   maxContextChars: 20000
 *   failureStrategy: continue
 *   sources:
 *     - type: memory_query
 *       query: "{{task.description}}"
 *       limit: 5
 * ```
 */
export interface ContextHydrationConfig {
  readonly sources?: readonly ContextSourceConfig[];
  /** Global timeout for all sources (default: 2000ms) */
  readonly maxHydrationTimeMs?: number;
  /** Total character budget across all sources (default: 20_000) */
  readonly maxContextChars?: number;
  /** What to do when a source fails: "continue" or "abort" (default: "continue") */
  readonly failureStrategy?: "continue" | "abort";
}

// ---------------------------------------------------------------------------
// Resolution Results
// ---------------------------------------------------------------------------

/**
 * Result of resolving a single context source.
 */
export interface ResolvedContextSource {
  readonly type: ContextSourceConfig["type"];
  readonly content: string;
  readonly originalChars: number;
  readonly truncated: boolean;
  readonly resolvedInMs: number;
}

/**
 * Metrics emitted per hydration run.
 */
export interface HydrationMetrics {
  readonly hydrationTimeMs: number;
  readonly sourcesResolved: number;
  readonly sourcesFailed: number;
  readonly contextCharsUsed: number;
  readonly cacheHit: boolean;
}

/**
 * Full result of a hydration run.
 */
export interface HydrationResult {
  readonly sources: readonly ResolvedContextSource[];
  readonly mergedContext: string;
  readonly metrics: HydrationMetrics;
}
