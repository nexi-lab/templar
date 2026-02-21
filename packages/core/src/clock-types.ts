/**
 * Clock abstraction — injectable for deterministic testing.
 *
 * Production code uses globalThis timers via `defaultClock`.
 * Tests inject a fake clock that controls time explicitly.
 */

export interface Clock {
  readonly now: () => number;
  readonly setTimeout: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setTimeout>;
  readonly clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => void;
}
