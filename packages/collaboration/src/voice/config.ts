/**
 * Configuration validation and resolution for VoiceEvolutionMiddleware.
 */

import type { MemoryEntry } from "@nexus/sdk";
import { CollaborationConfigurationError } from "@templar/errors";
import { parseDuration } from "../shared/duration.js";
import {
  DEFAULT_MAX_DRIFT,
  DEFAULT_MEMORY_QUERY_SCOPE,
  DEFAULT_QUERY_TIMEOUT_MS,
} from "./constants.js";
import type {
  PersonalityModifier,
  ResolvedVoiceEvolutionConfig,
  VoiceEvolutionConfig,
} from "./types.js";

const defaultClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),
} as const;

/**
 * Default modifier builder — extracts personality traits from memories.
 *
 * Looks for memories with type "preference" or "personality" and
 * creates modifiers with uniform weight distribution.
 */
function defaultModifierBuilder(memories: readonly MemoryEntry[]): readonly PersonalityModifier[] {
  const relevant = memories.filter(
    (m) =>
      m.memory_type === "preference" ||
      m.memory_type === "personality" ||
      m.memory_type === "style",
  );

  if (relevant.length === 0) return [];

  // Distribute weight evenly across modifiers
  const weightPerModifier = 1.0 / relevant.length;

  return relevant.map((memory) => ({
    source: memory.memory_id,
    modifier: typeof memory.content === "string" ? memory.content : JSON.stringify(memory.content),
    weight: Math.min(weightPerModifier, 0.1), // Cap individual weight at 0.1
    createdAt: memory.created_at ? new Date(memory.created_at).getTime() : Date.now(),
  }));
}

/**
 * Validate and resolve VoiceEvolutionConfig.
 */
export function resolveVoiceEvolutionConfig(
  config: VoiceEvolutionConfig,
): ResolvedVoiceEvolutionConfig {
  // Validate nexusClient
  if (!config.nexusClient) {
    throw new CollaborationConfigurationError("nexusClient is required for VoiceEvolution");
  }

  // Validate updateInterval
  const updateIntervalMs = parseDuration(config.updateInterval);
  if (updateIntervalMs <= 0) {
    throw new CollaborationConfigurationError(
      `updateInterval must be positive, got "${config.updateInterval}"`,
    );
  }

  // Validate maxDrift
  const maxDrift = config.maxDrift ?? DEFAULT_MAX_DRIFT;
  if (!Number.isFinite(maxDrift) || maxDrift < 0 || maxDrift > 1) {
    throw new CollaborationConfigurationError(`maxDrift must be between 0 and 1, got ${maxDrift}`);
  }

  // Validate queryTimeoutMs
  if (config.queryTimeoutMs !== undefined) {
    if (!Number.isFinite(config.queryTimeoutMs) || config.queryTimeoutMs <= 0) {
      throw new CollaborationConfigurationError(
        `queryTimeoutMs must be a positive number, got ${config.queryTimeoutMs}`,
      );
    }
  }

  return {
    nexusClient: config.nexusClient,
    basePersonality: config.basePersonality ?? "",
    updateIntervalMs,
    maxDrift,
    memoryQueryScope: config.memoryQueryScope ?? DEFAULT_MEMORY_QUERY_SCOPE,
    modifierBuilder: config.modifierBuilder ?? defaultModifierBuilder,
    clock: config.clock ?? defaultClock,
    queryTimeoutMs: config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  };
}
