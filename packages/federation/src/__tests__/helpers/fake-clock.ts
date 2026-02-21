/**
 * Deterministic clock for testing edge sync state machine.
 *
 * Controls time explicitly: `advance(ms)` resolves pending sleeps/timeouts.
 * Use `waitForSleep()` to wait until async code registers a sleep.
 */

import type { SyncClock } from "../../clock.js";

interface PendingTimer {
  readonly fn: () => void;
  readonly at: number;
  cleared: boolean;
}

interface PendingSleep {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly at: number;
  readonly signal?: AbortSignal | undefined;
}

export class FakeClock implements SyncClock {
  private _now = 0;
  private _timers: PendingTimer[] = [];
  private _sleeps: PendingSleep[] = [];
  private _nextTimerId = 1;
  private readonly _timerMap = new Map<number, PendingTimer>();
  private _sleepWaiters: (() => void)[] = [];
  private _timerWaiters: (() => void)[] = [];

  get now(): () => number {
    return () => this._now;
  }

  get setTimeout(): (fn: () => void, ms: number) => ReturnType<typeof globalThis.setTimeout> {
    return (fn: () => void, ms: number) => {
      const id = this._nextTimerId++;
      const timer: PendingTimer = { fn, at: this._now + ms, cleared: false };
      this._timers.push(timer);
      this._timerMap.set(id, timer);
      // Notify anyone waiting for a timer to be registered
      for (const waiter of this._timerWaiters.splice(0)) {
        waiter();
      }
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    };
  }

  get clearTimeout(): (id: ReturnType<typeof globalThis.setTimeout>) => void {
    return (id: ReturnType<typeof globalThis.setTimeout>) => {
      const timer = this._timerMap.get(id as unknown as number);
      if (timer) {
        timer.cleared = true;
      }
    };
  }

  get sleep(): (ms: number, signal?: AbortSignal) => Promise<void> {
    return (ms: number, signal?: AbortSignal): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          return;
        }

        const pending: PendingSleep = {
          resolve,
          reject,
          at: this._now + ms,
          signal,
        };
        this._sleeps.push(pending);

        // Notify anyone waiting for a sleep to be registered
        for (const waiter of this._sleepWaiters.splice(0)) {
          waiter();
        }

        signal?.addEventListener(
          "abort",
          () => {
            const idx = this._sleeps.indexOf(pending);
            if (idx >= 0) {
              this._sleeps.splice(idx, 1);
            }
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
  }

  /** Advance time by `ms` and fire any pending timers/sleeps. */
  advance(ms: number): void {
    this._now += ms;

    // Fire timers
    const readyTimers = this._timers.filter((t) => !t.cleared && t.at <= this._now);
    this._timers = this._timers.filter((t) => t.cleared || t.at > this._now);
    for (const timer of readyTimers) {
      timer.fn();
    }

    // Resolve sleeps
    const readySleeps = this._sleeps.filter((s) => s.at <= this._now);
    this._sleeps = this._sleeps.filter((s) => s.at > this._now);
    for (const sleep of readySleeps) {
      sleep.resolve();
    }
  }

  /**
   * Wait until a sleep is registered.
   * If a sleep is already pending, resolves immediately.
   */
  waitForSleep(): Promise<void> {
    if (this._sleeps.length > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._sleepWaiters.push(resolve);
    });
  }

  /**
   * Wait until a timer is registered.
   * If a timer is already pending, resolves immediately.
   */
  waitForTimer(): Promise<void> {
    if (this._timers.some((t) => !t.cleared)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._timerWaiters.push(resolve);
    });
  }

  /** Advance time and wait for async continuations to settle. */
  async advanceAndSettle(ms: number): Promise<void> {
    this.advance(ms);
    // Give microtasks a chance to process
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }

  /** Number of pending sleeps. */
  get pendingSleeps(): number {
    return this._sleeps.length;
  }

  /** Number of pending timers. */
  get pendingTimers(): number {
    return this._timers.filter((t) => !t.cleared).length;
  }
}
