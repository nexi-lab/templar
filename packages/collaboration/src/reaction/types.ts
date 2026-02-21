/**
 * Type definitions for ReactionMiddleware.
 */

import type { Clock } from "@templar/core";

// ---------------------------------------------------------------------------
// Nexus event representation
// ---------------------------------------------------------------------------

export interface NexusEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Event source interface (Decision 2 — injectable)
// ---------------------------------------------------------------------------

/**
 * Abstraction over event delivery mechanism.
 *
 * Default: PollingEventSource (polls NexusClient).
 * Future: WebSocketEventSource when issue #115 ships.
 */
export interface EventSource {
  start(handler: (event: NexusEvent) => void): void;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Reaction pattern definition
// ---------------------------------------------------------------------------

export interface ReactionPattern {
  /** Glob pattern matching event types: "nexus.file.*" */
  readonly event: string;
  /** Additional payload filters (exact match on values) */
  readonly match?: Readonly<Record<string, string>>;
  /** Probability of reacting (0.0 - 1.0) */
  readonly probability: number;
  /** Cooldown between reactions: "10m", "1h" */
  readonly cooldown: string;
  /** Action identifier passed to onReaction callback */
  readonly action: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ReactionConfig {
  /** Event patterns to react to */
  readonly patterns: readonly ReactionPattern[];
  /** Callback invoked when a reaction fires */
  readonly onReaction?: (pattern: ReactionPattern, event: NexusEvent) => Promise<void>;
  /** Injectable event source (default: PollingEventSource) */
  readonly eventSource?: EventSource;
  /** Injectable clock for testing */
  readonly clock?: Clock;
  /** Injectable RNG for deterministic testing (Decision 9) */
  readonly rng?: () => number;
  /** Poll interval for default PollingEventSource (ms, default: 5000) */
  readonly pollIntervalMs?: number;
}

export interface ResolvedReactionConfig {
  readonly patterns: readonly ReactionPattern[];
  readonly onReaction: (pattern: ReactionPattern, event: NexusEvent) => Promise<void>;
  readonly eventSource?: EventSource;
  readonly clock: Clock;
  readonly rng: () => number;
  readonly pollIntervalMs: number;
}
