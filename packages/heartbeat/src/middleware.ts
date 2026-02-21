/**
 * HeartbeatMiddleware — Hybrid TemplarMiddleware + public API (Decision 1A).
 *
 * Uses recursive setTimeout with drift compensation (Decision 6A).
 * onAfterTurn only updates lastActivityTimestamp (Decision 15B — zero hot-path overhead).
 */

import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { resolveHeartbeatConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import { runPipeline } from "./pipeline.js";
import { RingBuffer } from "./ring-buffer.js";
import type {
  HeartbeatConfig,
  HeartbeatContext,
  HeartbeatStatus,
  ResolvedHeartbeatConfig,
  TickResult,
} from "./types.js";

export class HeartbeatMiddleware implements TemplarMiddleware {
  readonly name: string = PACKAGE_NAME;

  private readonly _config: ResolvedHeartbeatConfig;
  private readonly _diagnostics: RingBuffer<TickResult>;
  private _running = false;
  private _tickNumber = 0;
  private _lastActivityTimestamp: number;
  private _sessionId = "";
  private _agentId: string | undefined;
  private _timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
  private _tickInProgress = false;
  private _stopResolve: (() => void) | undefined;

  constructor(config: HeartbeatConfig = {}) {
    this._config = resolveHeartbeatConfig(config);
    this._diagnostics = new RingBuffer<TickResult>(this._config.diagnosticsBufferSize);
    this._lastActivityTimestamp = this._config.clock.now();
  }

  // ---------------------------------------------------------------------------
  // Public API (Decision 1A)
  // ---------------------------------------------------------------------------

  /**
   * Start the heartbeat timer. Idempotent — multiple calls are safe.
   */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._scheduleNextTick(this._config.intervalMs);
  }

  /**
   * Stop the heartbeat timer and wait for any in-progress tick to complete.
   */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this._timerId !== undefined) {
      this._config.clock.clearTimeout(this._timerId);
      this._timerId = undefined;
    }

    // Wait for in-progress tick to finish
    if (this._tickInProgress) {
      return new Promise<void>((resolve) => {
        this._stopResolve = resolve;
      });
    }
  }

  /**
   * Return current heartbeat status and health.
   */
  status(): HeartbeatStatus {
    const latest = this._diagnostics.toArray();
    const lastTick = latest.length > 0 ? latest[latest.length - 1] : undefined;

    return {
      running: this._running,
      tickNumber: this._tickNumber,
      lastActivityTimestamp: this._lastActivityTimestamp,
      health: lastTick?.health ?? "healthy",
      evaluatorCount: this._config.evaluators.length,
    };
  }

  /**
   * Return diagnostics ring buffer contents.
   */
  getDiagnostics(): readonly TickResult[] {
    return this._diagnostics.toArray();
  }

  // ---------------------------------------------------------------------------
  // TemplarMiddleware lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(context: SessionContext): Promise<void> {
    this._sessionId = context.sessionId;
    this._agentId = context.agentId;
    this._lastActivityTimestamp = this._config.clock.now();
    this.start();
  }

  /**
   * Decision 15B — Only update timestamp. Zero hot-path overhead.
   */
  async onAfterTurn(_context: TurnContext): Promise<void> {
    this._lastActivityTimestamp = this._config.clock.now();
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    await this.stop();
  }

  // ---------------------------------------------------------------------------
  // Internal timer management (Decision 6A — recursive setTimeout + drift)
  // ---------------------------------------------------------------------------

  private _scheduleNextTick(delayMs: number): void {
    if (!this._running) return;

    this._timerId = this._config.clock.setTimeout(() => {
      void this._executeTick();
    }, delayMs);
  }

  private async _executeTick(): Promise<void> {
    if (!this._running) return;

    this._tickInProgress = true;
    this._tickNumber++;

    const tickStart = this._config.clock.now();

    const context: HeartbeatContext = {
      sessionId: this._sessionId,
      ...(this._agentId ? { agentId: this._agentId } : {}),
      tickNumber: this._tickNumber,
      lastActivityTimestamp: this._lastActivityTimestamp,
      intervalMs: this._config.intervalMs,
      ...(this._config.nexusClient ? { nexusClient: this._config.nexusClient } : {}),
    };

    try {
      const result = await runPipeline(context, {
        evaluators: this._config.evaluators,
        evaluatorTimeoutMs: this._config.evaluatorTimeoutMs,
        clock: this._config.clock,
      });

      this._diagnostics.push(result);
      this._config.onTick?.(result);
    } catch {
      // Pipeline-level failure — continue heartbeat
    }

    this._tickInProgress = false;

    // If stop() was called during this tick, resolve the stop promise
    if (!this._running) {
      this._stopResolve?.();
      this._stopResolve = undefined;
      return;
    }

    // Drift compensation (Decision 6A)
    const elapsed = this._config.clock.now() - tickStart;
    const nextDelay = Math.max(0, this._config.intervalMs - elapsed);
    this._scheduleNextTick(nextDelay);
  }
}

/**
 * Factory function to create a HeartbeatMiddleware instance.
 */
export function createHeartbeatMiddleware(config?: HeartbeatConfig): HeartbeatMiddleware {
  return new HeartbeatMiddleware(config);
}
