/**
 * Configuration validation and resolution for ReactionMiddleware.
 */

import { CollaborationConfigurationError } from "@templar/errors";
import { parseDuration } from "../shared/duration.js";
import { DEFAULT_POLL_INTERVAL_MS } from "./constants.js";
import { createEventMatcher } from "./matcher.js";
import type { ReactionConfig, ResolvedReactionConfig } from "./types.js";

const defaultClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),
} as const;

/**
 * Validate and resolve ReactionConfig to ResolvedReactionConfig.
 *
 * Validates all patterns (glob syntax + duration format) eagerly at config time
 * so runtime errors are caught early.
 */
export function resolveReactionConfig(config: ReactionConfig): ResolvedReactionConfig {
  if (!config.patterns || config.patterns.length === 0) {
    throw new CollaborationConfigurationError("patterns must contain at least one pattern");
  }

  // Validate each pattern eagerly
  for (const pattern of config.patterns) {
    // Validate glob pattern by compiling it
    createEventMatcher(pattern.event);

    // Validate probability range
    if (
      !Number.isFinite(pattern.probability) ||
      pattern.probability < 0 ||
      pattern.probability > 1
    ) {
      throw new CollaborationConfigurationError(
        `probability must be between 0 and 1, got ${pattern.probability}`,
      );
    }

    // Validate cooldown is parseable
    parseDuration(pattern.cooldown);

    // Validate action is non-empty
    if (!pattern.action || pattern.action.trim().length === 0) {
      throw new CollaborationConfigurationError("action must not be empty");
    }
  }

  // Validate pollIntervalMs
  if (config.pollIntervalMs !== undefined) {
    if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs <= 0) {
      throw new CollaborationConfigurationError(
        `pollIntervalMs must be a positive number, got ${config.pollIntervalMs}`,
      );
    }
  }

  return {
    patterns: config.patterns,
    onReaction: config.onReaction ?? (async () => {}),
    ...(config.eventSource ? { eventSource: config.eventSource } : {}),
    clock: config.clock ?? defaultClock,
    rng: config.rng ?? Math.random,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };
}
