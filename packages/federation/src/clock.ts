/**
 * Extended clock interface for edge sync — adds cancellable sleep.
 *
 * Extends @templar/core's Clock with an async `sleep()` method
 * that supports AbortSignal cancellation (Decision #14).
 */

import type { Clock } from "@templar/core";

// ---------------------------------------------------------------------------
// Extended clock with sleep
// ---------------------------------------------------------------------------

/** Clock with async sleep support for edge sync state machine. */
export interface SyncClock extends Clock {
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Default (real) implementation
// ---------------------------------------------------------------------------

/** Production clock using real timers and Date.now(). */
export const defaultSyncClock: SyncClock = {
  now: () => Date.now(),

  setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),

  clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),

  sleep: (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }

      const timer = globalThis.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);

      function onAbort() {
        globalThis.clearTimeout(timer);
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      }

      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};
