/**
 * Event pattern matcher using picomatch (Decision 6 — no ReDoS).
 */

import { ReactionPatternInvalidError } from "@templar/errors";
import picomatch from "picomatch";

/**
 * Create a compiled matcher function for an event glob pattern.
 *
 * @param pattern - Glob pattern like "nexus.file.*" or "nexus.agent.mentioned"
 * @returns A function that tests event type strings against the pattern
 * @throws ReactionPatternInvalidError if pattern is empty or invalid
 */
export function createEventMatcher(pattern: string): (eventType: string) => boolean {
  if (!pattern || pattern.trim().length === 0) {
    throw new ReactionPatternInvalidError(pattern, "pattern must not be empty");
  }

  try {
    return picomatch(pattern, { dot: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    throw new ReactionPatternInvalidError(pattern, msg);
  }
}

/**
 * Check if additional match filters pass against an event payload.
 *
 * Each key-value in `filters` must match the corresponding key in `payload` (exact string match).
 */
export function matchesFilters(
  filters: Readonly<Record<string, string>> | undefined,
  payload: Readonly<Record<string, unknown>>,
): boolean {
  if (!filters) return true;

  for (const [key, value] of Object.entries(filters)) {
    if (String(payload[key]) !== value) {
      return false;
    }
  }

  return true;
}
