/**
 * Edge sync state machine manager.
 *
 * Drives a reconnection sequence through the states:
 *   DISCONNECTED → RECONNECTING → AUTH_REFRESH → CONFLICT_SCAN → WAL_REPLAY → ONLINE
 *
 * Uses EventEmitter for state change notifications (Decision #2)
 * and callback-based phase handlers for pluggable logic.
 */

import { EventEmitter } from "node:events";
import type { EdgeSyncConfig, SyncState } from "@templar/core";
import {
  FederationSyncDisconnectedError,
  FederationSyncInvalidTransitionError,
  FederationSyncTimeoutError,
} from "@templar/errors";
import type { SyncClock } from "../clock.js";
import { defaultSyncClock } from "../clock.js";
import { resolveEdgeSyncConfig } from "./config.js";
import { isValidTransition } from "./constants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Events emitted by EdgeSyncManager. */
export interface EdgeSyncEvents {
  stateChange: [{ from: SyncState; to: SyncState }];
  error: [Error];
  connected: [];
  disconnected: [{ reason: string }];
}

/** Phase handler callbacks — pluggable per-phase logic. */
export interface SyncPhaseHandlers {
  /** Establish transport-level connection. */
  readonly onReconnect: (attempt: number, signal: AbortSignal) => Promise<void>;
  /** Refresh authentication credentials. */
  readonly onAuthRefresh: (signal: AbortSignal) => Promise<void>;
  /** Scan for and resolve conflicts. */
  readonly onConflictScan: (signal: AbortSignal) => Promise<void>;
  /** Replay write-ahead log entries. */
  readonly onWalReplay: (signal: AbortSignal) => Promise<void>;
}

export interface EdgeSyncManagerOptions {
  readonly handlers: SyncPhaseHandlers;
  readonly config?: EdgeSyncConfig;
  readonly clock?: SyncClock;
}

// ---------------------------------------------------------------------------
// EdgeSyncManager
// ---------------------------------------------------------------------------

/**
 * Edge sync state machine manager.
 *
 * Attach an `'error'` listener to observe per-attempt failures without
 * interrupting the retry loop. Errors are only emitted when a listener
 * is present; otherwise they are silently consumed to keep the retry
 * flow intact.
 */
export class EdgeSyncManager extends EventEmitter<EdgeSyncEvents> {
  private _state: SyncState = "DISCONNECTED";
  private _abortController: AbortController | null = null;
  private readonly _handlers: SyncPhaseHandlers;
  private readonly _config: Required<EdgeSyncConfig>;
  private readonly _clock: SyncClock;

  constructor(options: EdgeSyncManagerOptions) {
    super();
    this._handlers = options.handlers;
    this._config = resolveEdgeSyncConfig(options.config);
    this._clock = options.clock ?? defaultSyncClock;
  }

  /** Current sync state. */
  get state(): SyncState {
    return this._state;
  }

  /** Whether currently online. */
  get isOnline(): boolean {
    return this._state === "ONLINE";
  }

  // -----------------------------------------------------------------------
  // State transitions
  // -----------------------------------------------------------------------

  private transition(to: SyncState): void {
    const from = this._state;
    if (from === to) return;

    if (!isValidTransition(from, to)) {
      throw new FederationSyncInvalidTransitionError(from, to);
    }

    this._state = to;
    this.emit("stateChange", { from, to });

    if (to === "ONLINE") {
      this.emit("connected");
    }
  }

  // -----------------------------------------------------------------------
  // Phase execution with timeout
  // -----------------------------------------------------------------------

  private async runWithTimeout(
    phaseName: string,
    timeoutMs: number,
    fn: (signal: AbortSignal) => Promise<void>,
    parentSignal: AbortSignal,
  ): Promise<void> {
    const phaseController = new AbortController();

    // Link to parent so disconnect() cancels phases
    const onParentAbort = () => phaseController.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", onParentAbort, { once: true });

    const timer = this._clock.setTimeout(
      () => phaseController.abort(new FederationSyncTimeoutError(timeoutMs, phaseName)),
      timeoutMs,
    );

    try {
      await Promise.race([
        fn(phaseController.signal),
        new Promise<void>((_, reject) => {
          if (phaseController.signal.aborted) {
            reject(phaseController.signal.reason);
            return;
          }
          phaseController.signal.addEventListener(
            "abort",
            () => reject(phaseController.signal.reason),
            { once: true },
          );
        }),
      ]);
    } finally {
      this._clock.clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  }

  // -----------------------------------------------------------------------
  // Reconnection with exponential backoff
  // -----------------------------------------------------------------------

  private backoffDelay(attempt: number): number {
    const delay = this._config.reconnectBaseDelayMs * 2 ** attempt;
    return Math.min(delay, this._config.reconnectMaxDelayMs);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Begin the full reconnection sequence.
   *
   * Transitions through all phases with retry + exponential backoff
   * on the reconnect phase. Resolves when ONLINE, rejects if all
   * attempts exhausted or disconnect() is called.
   */
  async connect(): Promise<void> {
    if (this._state === "ONLINE") return;
    if (this._abortController) {
      // Already connecting — abort previous attempt
      this._abortController.abort(new DOMException("Superseded", "AbortError"));
    }

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this._config.maxReconnectAttempts; attempt++) {
      if (signal.aborted) {
        throw new FederationSyncDisconnectedError("Connection aborted");
      }

      try {
        // Phase 1: RECONNECTING
        this.transition("RECONNECTING");
        await this._handlers.onReconnect(attempt, signal);

        // Phase 2: AUTH_REFRESH
        this.transition("AUTH_REFRESH");
        await this.runWithTimeout(
          "AUTH_REFRESH",
          this._config.authRefreshTimeoutMs,
          this._handlers.onAuthRefresh,
          signal,
        );

        // Phase 3: CONFLICT_SCAN
        this.transition("CONFLICT_SCAN");
        await this.runWithTimeout(
          "CONFLICT_SCAN",
          this._config.conflictScanTimeoutMs,
          this._handlers.onConflictScan,
          signal,
        );

        // Phase 4: WAL_REPLAY
        this.transition("WAL_REPLAY");
        await this.runWithTimeout(
          "WAL_REPLAY",
          this._config.walReplayTimeoutMs,
          this._handlers.onWalReplay,
          signal,
        );

        // Success
        this.transition("ONLINE");
        this._abortController = null;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (this.listenerCount("error") > 0) {
          this.emit("error", lastError);
        }

        // If aborted (disconnect called), don't retry
        if (signal.aborted) {
          this.transitionToDisconnected("Connection aborted");
          throw new FederationSyncDisconnectedError("Connection aborted");
        }

        // Transition back to DISCONNECTED for retry
        this.transitionToDisconnected(`Attempt ${attempt + 1} failed: ${lastError.message}`);

        // Backoff before next attempt (unless last attempt)
        if (attempt < this._config.maxReconnectAttempts - 1) {
          const delay = this.backoffDelay(attempt);
          try {
            await this._clock.sleep(delay, signal);
          } catch {
            // Sleep aborted — disconnect was called
            this.transitionToDisconnected("Connection aborted during backoff");
            throw new FederationSyncDisconnectedError("Connection aborted during backoff");
          }
        }
      }
    }

    // All attempts exhausted
    this.transitionToDisconnected("Max reconnect attempts exhausted");
    throw lastError ?? new FederationSyncDisconnectedError("Max reconnect attempts exhausted");
  }

  /**
   * Disconnect and cancel any in-progress connection attempt.
   */
  disconnect(reason = "Manual disconnect"): void {
    if (this._abortController) {
      this._abortController.abort(new DOMException(reason, "AbortError"));
      this._abortController = null;
    }
    this.transitionToDisconnected(reason);
  }

  /**
   * Clean up all event listeners and abort any in-flight operations.
   * Call before discarding this instance to prevent memory leaks.
   */
  destroy(): void {
    this.disconnect("Manager destroyed");
    this.removeAllListeners();
  }

  private transitionToDisconnected(reason: string): void {
    if (this._state !== "DISCONNECTED") {
      this.transition("DISCONNECTED");
      this.emit("disconnected", { reason });
    }
  }
}
