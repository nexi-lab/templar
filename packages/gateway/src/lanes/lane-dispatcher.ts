import type { LaneMessage, QueuedLane } from "@templar/gateway-protocol";
import { QUEUED_LANES } from "@templar/gateway-protocol";
import { type Emitter, createEmitter } from "../utils/emitter.js";
import { BoundedFifoQueue } from "./queue.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterruptHandler = (message: LaneMessage) => void;
export type OverflowHandler = (lane: QueuedLane, dropped: LaneMessage) => void;

// ---------------------------------------------------------------------------
// Lane Dispatcher Events
// ---------------------------------------------------------------------------

type LaneDispatcherEvents = {
  interrupt: [message: LaneMessage];
  overflow: [lane: QueuedLane, dropped: LaneMessage];
};

// ---------------------------------------------------------------------------
// LaneDispatcher
// ---------------------------------------------------------------------------

/**
 * Priority-based message dispatcher with per-lane FIFO queues.
 *
 * Drain order: steer (all) → collect (all) → followup (all).
 * Interrupt messages bypass all queues and are delivered immediately.
 */
export class LaneDispatcher {
  private readonly queues: Readonly<Record<QueuedLane, BoundedFifoQueue<LaneMessage>>>;
  private readonly events: Emitter<LaneDispatcherEvents> = createEmitter();

  constructor(capacity: number) {
    this.queues = {
      steer: new BoundedFifoQueue(capacity),
      collect: new BoundedFifoQueue(capacity),
      followup: new BoundedFifoQueue(capacity),
    };
  }

  /**
   * Dispatch a message to the appropriate lane.
   * Interrupt messages bypass queues entirely.
   */
  dispatch(message: LaneMessage): void {
    if (message.lane === "interrupt") {
      this.events.emit("interrupt", message);
      return;
    }

    const lane = message.lane as QueuedLane;
    const queue = this.queues[lane];
    const dropped = queue.enqueue(message);
    if (dropped !== undefined) {
      this.events.emit("overflow", lane, dropped);
    }
  }

  /**
   * Drain all queues in priority order: steer → collect → followup.
   * Returns all messages in priority-then-FIFO order.
   */
  drain(): readonly LaneMessage[] {
    const result: LaneMessage[] = [];
    for (const lane of QUEUED_LANES) {
      const items = this.queues[lane].drain();
      result.push(...items);
    }
    return result;
  }

  /**
   * Register a handler for interrupt messages.
   * Returns a disposer function.
   */
  onInterrupt(handler: InterruptHandler): () => void {
    return this.events.on("interrupt", handler);
  }

  /**
   * Register a handler for overflow events.
   * Returns a disposer function.
   */
  onOverflow(handler: OverflowHandler): () => void {
    return this.events.on("overflow", handler);
  }

  /**
   * Get the current size of a specific lane's queue.
   */
  queueSize(lane: QueuedLane): number {
    return this.queues[lane].size;
  }

  /**
   * Get total messages across all queues.
   */
  get totalQueued(): number {
    let total = 0;
    for (const lane of QUEUED_LANES) {
      total += this.queues[lane].size;
    }
    return total;
  }
}
