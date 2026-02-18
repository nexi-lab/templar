// ---------------------------------------------------------------------------
// Spawn Governance Types (#163)
// ---------------------------------------------------------------------------

/**
 * Depth-aware tool policy — controls which tools are available at each spawn depth.
 *
 * Each depth level can specify an allow-list and/or deny-list of tool names.
 * Deny takes precedence over allow. If neither is specified for a depth,
 * the agent inherits the parent's effective tool set.
 *
 * @example
 * ```ts
 * const policy: DepthToolPolicy = {
 *   0: {},                                    // depth 0: all tools (no restrictions)
 *   1: { deny: ["sessions_spawn"] },          // depth 1: all except spawn
 *   2: { allow: ["read_file", "search"] },    // depth 2: read-only tools
 * };
 * ```
 */
export interface DepthToolPolicy {
  readonly [depth: number]: {
    /** Tools explicitly allowed at this depth (default: inherit parent's set) */
    readonly allow?: readonly string[];
    /** Tools explicitly denied at this depth (applied after allow) */
    readonly deny?: readonly string[];
  };
}

/**
 * Configuration for spawn governance — limits on sub-agent spawning.
 *
 * Parallel to `ExecutionLimitsConfig` for single-agent execution guards.
 */
export interface SpawnLimitsConfig {
  /** Maximum spawn depth (0 = root agent, default: 2) */
  readonly maxSpawnDepth?: number;
  /** Maximum concurrent children per parent agent (default: 5) */
  readonly maxChildrenPerAgent?: number;
  /** Maximum total concurrent sub-agents across the orchestration tree (default: 8) */
  readonly maxConcurrent?: number;
  /** Depth-aware tool filtering policy */
  readonly depthToolPolicy?: DepthToolPolicy;
  /** Action when a spawn limit is exceeded (default: "error") */
  readonly onExceeded?: "warn" | "stop" | "error";
}

/**
 * Decision returned by spawn governance checks.
 */
export type SpawnDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly code: SpawnDenialCode };

/**
 * Specific reason a spawn was denied.
 */
export type SpawnDenialCode =
  | "depth_exceeded"
  | "child_limit"
  | "concurrency_limit"
  | "tool_denied";

/**
 * Immutable snapshot of spawn governance state.
 */
export interface SpawnGuardState {
  /** Number of currently active sub-agents across the tree */
  readonly activeConcurrent: number;
  /** Total spawns since guard creation (including completed) */
  readonly totalSpawns: number;
  /** Active children count per parent agent ID */
  readonly activeByParent: ReadonlyMap<string, number>;
}

/**
 * Data shape for the PreSubagentSpawn hook event.
 *
 * Emitted before a sub-agent spawn attempt — interceptor handlers can
 * block or modify the spawn.
 */
export interface PreSubagentSpawnData {
  readonly parentAgentId: string;
  readonly sessionId: string;
  /** Configuration for the child agent being spawned */
  readonly childConfig: {
    readonly agentId?: string;
    readonly task: string;
    readonly model?: string;
    readonly tools?: readonly string[];
  };
  /** Current spawn depth of the parent agent (0 = root) */
  readonly currentDepth: number;
  /** Number of currently active children for this parent */
  readonly activeChildren: number;
  /** Total concurrent sub-agents across the orchestration tree */
  readonly activeConcurrent: number;
}

/**
 * Discriminated union of reasons a spawn was stopped.
 * Extends StopReason with spawn-specific variants.
 */
export type SpawnStopReason =
  | { readonly kind: "spawn_depth_exceeded"; readonly depth: number; readonly maxDepth: number }
  | {
      readonly kind: "spawn_child_limit";
      readonly parentAgentId: string;
      readonly children: number;
      readonly max: number;
    }
  | { readonly kind: "spawn_concurrency_limit"; readonly concurrent: number; readonly max: number }
  | { readonly kind: "spawn_tool_denied"; readonly toolName: string; readonly depth: number };
