/**
 * Default clock implementation (Decision 9A).
 *
 * Thin wrapper over globalThis timers.
 * Tests inject a fake clock for deterministic behavior.
 */

import type { Clock } from "./types.js";

export const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};
