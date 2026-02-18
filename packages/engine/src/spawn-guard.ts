import type { SpawnGuardState, SpawnLimitsConfig } from "@templar/core";
import {
  SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
} from "@templar/errors";

// ---------------------------------------------------------------------------
// Default spawn limits (safe production defaults from OpenClaw research)
// ---------------------------------------------------------------------------

export const DEFAULT_SPAWN_LIMITS: Readonly<
  Required<Omit<SpawnLimitsConfig, "depthToolPolicy" | "onExceeded">>
> = {
  maxSpawnDepth: 2,
  maxChildrenPerAgent: 5,
  maxConcurrent: 8,
} as const;

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function validateNonNegativeInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer, got ${value}`);
  }
}

// ---------------------------------------------------------------------------
// SpawnGuard — Engine-level hard caps on sub-agent spawning
// ---------------------------------------------------------------------------

/**
 * Enforces hard spawn limits on sub-agent creation.
 *
 * Used by the engine to gate sub-agent spawns. Create one per orchestration
 * run. Prefer `checkAndRecord()` for atomic check+record to avoid TOCTOU
 * races when async work (e.g., hook emission) happens between check and record.
 *
 * State is managed via immutable snapshots — each mutation creates a new
 * state object. This ensures testability and avoids race conditions.
 *
 * Throws SpawnDepthExceededError, SpawnChildLimitError, or
 * SpawnConcurrencyLimitError when limits are exceeded.
 */
export class SpawnGuard {
  private readonly maxSpawnDepth: number;
  private readonly maxChildrenPerAgent: number;
  private readonly maxConcurrent: number;
  private state: SpawnGuardState;

  constructor(
    limits?: Pick<SpawnLimitsConfig, "maxSpawnDepth" | "maxChildrenPerAgent" | "maxConcurrent">,
  ) {
    this.maxSpawnDepth = limits?.maxSpawnDepth ?? DEFAULT_SPAWN_LIMITS.maxSpawnDepth;
    this.maxChildrenPerAgent =
      limits?.maxChildrenPerAgent ?? DEFAULT_SPAWN_LIMITS.maxChildrenPerAgent;
    this.maxConcurrent = limits?.maxConcurrent ?? DEFAULT_SPAWN_LIMITS.maxConcurrent;

    validateNonNegativeInteger("maxSpawnDepth", this.maxSpawnDepth);
    validateNonNegativeInteger("maxChildrenPerAgent", this.maxChildrenPerAgent);
    validateNonNegativeInteger("maxConcurrent", this.maxConcurrent);

    this.state = {
      activeConcurrent: 0,
      totalSpawns: 0,
      activeByParent: new Map(),
    };
  }

  /**
   * Check whether a spawn is allowed. Throws if any limit is exceeded.
   *
   * Check order: depth -> per-parent children -> global concurrency.
   *
   * WARNING: If async work (hook emission, etc.) happens between `checkSpawn`
   * and `recordSpawn`, another caller could pass `checkSpawn` in the gap.
   * Use `checkAndRecord()` for atomic check+record when this is a concern.
   */
  checkSpawn(parentAgentId: string, childDepth: number): void {
    // 1. Depth check
    if (childDepth > this.maxSpawnDepth) {
      throw new SpawnDepthExceededError(childDepth, this.maxSpawnDepth);
    }

    // 2. Per-parent child limit
    const currentChildren = this.state.activeByParent.get(parentAgentId) ?? 0;
    if (currentChildren >= this.maxChildrenPerAgent) {
      throw new SpawnChildLimitError(parentAgentId, currentChildren, this.maxChildrenPerAgent);
    }

    // 3. Global concurrency
    if (this.state.activeConcurrent >= this.maxConcurrent) {
      throw new SpawnConcurrencyLimitError(this.state.activeConcurrent, this.maxConcurrent);
    }
  }

  /**
   * Atomically check and record a spawn in a single call.
   *
   * Eliminates the TOCTOU race between separate `checkSpawn` and `recordSpawn`
   * calls. Throws on limit violation before any state mutation occurs.
   */
  checkAndRecord(parentAgentId: string, childDepth: number): void {
    this.checkSpawn(parentAgentId, childDepth);
    this.recordSpawn(parentAgentId);
  }

  /**
   * Record that a spawn succeeded. Call after the child agent is created.
   *
   * Creates a new immutable state snapshot with updated counters.
   */
  recordSpawn(parentAgentId: string): void {
    const currentChildren = this.state.activeByParent.get(parentAgentId) ?? 0;
    const newActiveByParent = new Map(this.state.activeByParent);
    newActiveByParent.set(parentAgentId, currentChildren + 1);

    this.state = {
      activeConcurrent: this.state.activeConcurrent + 1,
      totalSpawns: this.state.totalSpawns + 1,
      activeByParent: newActiveByParent,
    };
  }

  /**
   * Record that a child agent completed. Call when the child finishes.
   *
   * Creates a new immutable state snapshot with decremented counters.
   * Removes the parent entry from the map when its count reaches 0.
   * Ignores completions for untracked parents (no-op for unknown IDs).
   */
  recordCompletion(parentAgentId: string): void {
    const currentChildren = this.state.activeByParent.get(parentAgentId) ?? 0;

    // Ignore completions for untracked parents — prevents state corruption
    if (currentChildren === 0) {
      return;
    }

    const newActiveByParent = new Map(this.state.activeByParent);

    if (currentChildren <= 1) {
      newActiveByParent.delete(parentAgentId);
    } else {
      newActiveByParent.set(parentAgentId, currentChildren - 1);
    }

    this.state = {
      activeConcurrent: Math.max(0, this.state.activeConcurrent - 1),
      totalSpawns: this.state.totalSpawns,
      activeByParent: newActiveByParent,
    };
  }

  /**
   * Reset all state to initial values. Useful for session restarts.
   */
  reset(): void {
    this.state = {
      activeConcurrent: 0,
      totalSpawns: 0,
      activeByParent: new Map(),
    };
  }

  /** Current immutable state snapshot */
  getState(): SpawnGuardState {
    return this.state;
  }

  /** Configured max spawn depth */
  get maxDepth(): number {
    return this.maxSpawnDepth;
  }

  /** Configured max children per agent */
  get childLimit(): number {
    return this.maxChildrenPerAgent;
  }

  /** Configured max concurrent */
  get concurrencyLimit(): number {
    return this.maxConcurrent;
  }
}
