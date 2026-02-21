/**
 * EventSource implementations (Decision 2 — injectable interface).
 *
 * PollingEventSource: Placeholder polling implementation.
 * When issue #115 (WebSocket Event Bus subscription) ships,
 * a WebSocketEventSource can replace this without changing ReactionMiddleware.
 */

import type { Clock } from "@templar/core";
import type { EventSource, NexusEvent } from "./types.js";

/**
 * In-memory event source for testing and manual event injection.
 *
 * Events are pushed via `emit()` and delivered to the registered handler.
 */
export class InMemoryEventSource implements EventSource {
  private handler: ((event: NexusEvent) => void) | undefined;
  private started = false;

  start(handler: (event: NexusEvent) => void): void {
    this.handler = handler;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.handler = undefined;
    this.started = false;
  }

  /** Manually emit an event (for testing or programmatic injection). */
  emit(event: NexusEvent): void {
    if (this.started && this.handler) {
      this.handler(event);
    }
  }

  isStarted(): boolean {
    return this.started;
  }
}

/**
 * Polling-based event source that calls a provider function on interval.
 *
 * This is the default EventSource when no custom one is provided.
 * Uses cursor-based pagination (Decision 14) — the provider function
 * should return only new events since the last call.
 */
export class PollingEventSource implements EventSource {
  private handler: ((event: NexusEvent) => void) | undefined;
  private timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
  private readonly clock: Clock;
  private readonly intervalMs: number;
  private readonly provider: () => Promise<readonly NexusEvent[]>;

  constructor(options: {
    readonly clock: Clock;
    readonly intervalMs: number;
    readonly provider: () => Promise<readonly NexusEvent[]>;
  }) {
    this.clock = options.clock;
    this.intervalMs = options.intervalMs;
    this.provider = options.provider;
  }

  start(handler: (event: NexusEvent) => void): void {
    this.handler = handler;
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    if (this.timerId !== undefined) {
      this.clock.clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    this.handler = undefined;
  }

  private schedulePoll(): void {
    this.timerId = this.clock.setTimeout(() => {
      void this.poll();
    }, this.intervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.handler) return;

    try {
      const events = await this.provider();
      for (const event of events) {
        this.handler(event);
      }
    } catch {
      // Graceful degradation — log and continue polling
    }

    // Schedule next poll if still active
    if (this.handler !== undefined) {
      this.schedulePoll();
    }
  }
}
