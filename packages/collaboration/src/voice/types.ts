/**
 * Type definitions for VoiceEvolutionMiddleware.
 */

import type { Clock } from "@templar/core";
import type { MemoryEntry, NexusClient } from "@nexus/sdk";

// ---------------------------------------------------------------------------
// Personality modifier
// ---------------------------------------------------------------------------

export interface PersonalityModifier {
  /** Memory ID or description of the modifier source */
  readonly source: string;
  /** System prompt addition text */
  readonly modifier: string;
  /** Weight of this modifier (0.0 - 1.0) */
  readonly weight: number;
  /** When this modifier was created */
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Modifier builder (injectable)
// ---------------------------------------------------------------------------

/**
 * Builds personality modifiers from accumulated memories.
 *
 * Default implementation extracts preferences and behavioral patterns.
 * Users can inject custom builders for domain-specific voice evolution.
 */
export type ModifierBuilder = (
  memories: readonly MemoryEntry[],
) => readonly PersonalityModifier[];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface VoiceEvolutionConfig {
  /** NexusClient for querying memories */
  readonly nexusClient: NexusClient;
  /** Immutable base personality prompt (never modified) */
  readonly basePersonality?: string;
  /** How often to re-derive modifiers from memory: "1h", "30m" */
  readonly updateInterval: string;
  /** Max total modifier weight (0.0 - 1.0). Decision 7: weight cap */
  readonly maxDrift: number;
  /** Memory query scope filter */
  readonly memoryQueryScope?: string;
  /** Injectable modifier builder */
  readonly modifierBuilder?: ModifierBuilder;
  /** Injectable clock for testing */
  readonly clock?: Clock;
  /** Timeout for memory query (ms, default: 5000) */
  readonly queryTimeoutMs?: number;
}

export interface ResolvedVoiceEvolutionConfig {
  readonly nexusClient: NexusClient;
  readonly basePersonality: string;
  readonly updateIntervalMs: number;
  readonly maxDrift: number;
  readonly memoryQueryScope: string;
  readonly modifierBuilder: ModifierBuilder;
  readonly clock: Clock;
  readonly queryTimeoutMs: number;
}
