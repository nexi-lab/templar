import type {
  PreSubagentSpawnData,
  SessionContext,
  SpawnGuardState,
  SpawnLimitsConfig,
  TemplarMiddleware,
} from "@templar/core";
import { SpawnGovernanceError, SpawnToolDeniedError } from "@templar/errors";
import { DEFAULT_SPAWN_LIMITS, SpawnGuard } from "./spawn-guard.js";
import { filterDefined } from "./utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pre-computed denied tool set for a specific depth level */
type DeniedToolSet = ReadonlySet<string>;

/** Result of a spawn governance check */
export interface SpawnCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// SpawnGovernanceMiddleware
// ---------------------------------------------------------------------------

/**
 * Middleware that governs sub-agent spawning with depth, fan-out,
 * and concurrency limits plus depth-aware tool filtering.
 *
 * Designed to complement IterationGuard and ExecutionGuardMiddleware:
 * - IterationGuard: hard cap on iterations per agent (engine layer)
 * - ExecutionGuardMiddleware: loop detection per agent (middleware layer)
 * - SpawnGovernanceMiddleware: cross-agent spawn limits (middleware layer)
 *
 * State is managed via an internal SpawnGuard (immutable state snapshots).
 */
export class SpawnGovernanceMiddleware implements TemplarMiddleware {
  readonly name = "templar:spawn-governance";
  private readonly guard: SpawnGuard;
  private readonly config: SpawnLimitsConfig;
  private readonly onExceeded: "warn" | "stop" | "error";

  /** Pre-computed denied tool sets per depth (computed once from policy) */
  private readonly deniedByDepth: ReadonlyMap<number, DeniedToolSet>;

  /** Pre-computed allowed tool sets per depth (if explicitly set) */
  private readonly allowedByDepth: ReadonlyMap<number, ReadonlySet<string>>;

  constructor(config?: SpawnLimitsConfig) {
    this.config = { ...DEFAULT_SPAWN_LIMITS, ...filterDefined(config) };
    this.onExceeded = this.config.onExceeded ?? "error";
    this.guard = new SpawnGuard(this.config);

    // Pre-compute tool policy sets for O(1) lookups
    const deniedMap = new Map<number, DeniedToolSet>();
    const allowedMap = new Map<number, ReadonlySet<string>>();

    if (this.config.depthToolPolicy) {
      for (const depthStr of Object.keys(this.config.depthToolPolicy)) {
        const depth = Number(depthStr);
        const policy = this.config.depthToolPolicy[depth];
        if (policy?.deny) {
          deniedMap.set(depth, new Set(policy.deny));
        }
        if (policy?.allow) {
          allowedMap.set(depth, new Set(policy.allow));
        }
      }
    }

    this.deniedByDepth = deniedMap;
    this.allowedByDepth = allowedMap;
  }

  /**
   * Reset guard state on session start for a clean slate.
   */
  async onSessionStart(_context: SessionContext): Promise<void> {
    this.guard.reset();
  }

  /**
   * Check whether a spawn is allowed at the given depth and parent.
   *
   * This method is the primary integration point — call it before spawning
   * a sub-agent. It delegates to SpawnGuard for hard caps and applies
   * the configurable onExceeded behavior.
   *
   * @returns SpawnCheckResult indicating whether the spawn is allowed.
   *          When onExceeded="warn", returns { allowed: true } even on limit.
   *          When onExceeded="stop" or "error", throws.
   */
  checkSpawn(parentAgentId: string, childDepth: number): SpawnCheckResult {
    try {
      this.guard.checkSpawn(parentAgentId, childDepth);
      return { allowed: true };
    } catch (error) {
      if (error instanceof SpawnGovernanceError) {
        return this.handleExceeded(error);
      }
      throw error;
    }
  }

  /**
   * Check whether a tool is allowed at the given depth.
   *
   * Uses the pre-computed Set-based policy for O(1) lookups.
   * If no policy exists for the depth, all tools are allowed.
   *
   * @returns true if the tool is allowed, false if denied
   */
  isToolAllowed(toolName: string, depth: number): boolean {
    // Check allow-list first (if present, tool must be in it)
    const allowed = this.allowedByDepth.get(depth);
    if (allowed && !allowed.has(toolName)) {
      return false;
    }

    // Check deny-list
    const denied = this.deniedByDepth.get(depth);
    if (denied?.has(toolName)) {
      return false;
    }

    return true;
  }

  /**
   * Check tool access and throw SpawnToolDeniedError if denied.
   * Uses the configurable onExceeded behavior.
   */
  checkToolAccess(toolName: string, depth: number): SpawnCheckResult {
    if (this.isToolAllowed(toolName, depth)) {
      return { allowed: true };
    }

    const error = new SpawnToolDeniedError(toolName, depth);
    return this.handleExceeded(error);
  }

  /**
   * Record a successful spawn. Call after the child agent is created.
   */
  recordSpawn(parentAgentId: string): void {
    this.guard.recordSpawn(parentAgentId);
  }

  /**
   * Record a child completion. Call when a child agent finishes.
   */
  recordCompletion(parentAgentId: string): void {
    this.guard.recordCompletion(parentAgentId);
  }

  /**
   * Get the underlying guard's immutable state snapshot.
   */
  getGuardState(): SpawnGuardState {
    return this.guard.getState();
  }

  /**
   * Build the PreSubagentSpawn hook data for emission.
   */
  buildHookData(
    parentAgentId: string,
    sessionId: string,
    childConfig: {
      readonly agentId?: string;
      readonly task: string;
      readonly model?: string;
      readonly tools?: readonly string[];
    },
    currentDepth: number,
  ): PreSubagentSpawnData {
    const state = this.guard.getState();
    return {
      parentAgentId: parentAgentId,
      sessionId: sessionId,
      childConfig: childConfig,
      currentDepth: currentDepth,
      activeChildren: state.activeByParent.get(parentAgentId) ?? 0,
      activeConcurrent: state.activeConcurrent,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private handleExceeded(error: SpawnGovernanceError): SpawnCheckResult {
    switch (this.onExceeded) {
      case "warn":
        console.warn(`[${this.name}] ${error.message}`);
        return { allowed: true, reason: error.message };
      case "stop":
        console.warn(`[${this.name}] Blocking spawn: ${error.message}`);
        throw error;
      case "error":
        throw error;
    }
  }
}
