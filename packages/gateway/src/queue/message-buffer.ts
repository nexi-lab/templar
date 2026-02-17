import type { LaneMessage, QueuedLane } from "../protocol/index.js";
import { LANE_PRIORITY, QUEUED_LANES } from "../protocol/index.js";
import { createEmitter, type Emitter } from "../utils/emitter.js";
import { BoundedFifoQueue } from "./bounded-fifo.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterruptHandler = (message: LaneMessage) => void;
export type OverflowHandler = (dropped: LaneMessage) => void;

/** Internal wrapper — adds sequence number for stable priority sort. */
interface QueuedEntry {
  readonly seq: number;
  readonly lane: QueuedLane;
  readonly message: LaneMessage;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type MessageBufferEvents = {
  interrupt: [message: LaneMessage];
  overflow: [dropped: LaneMessage];
};

// ---------------------------------------------------------------------------
// MessageBuffer
// ---------------------------------------------------------------------------

/**
 * Bounded priority message buffer backed by a single ring-buffer queue.
 *
 * Messages are enqueued in O(1) and drained in priority-then-FIFO order
 * via sort-on-drain: `LANE_PRIORITY[lane]` ascending, then `seq` ascending.
 *
 * Interrupt messages bypass the queue entirely and are delivered immediately.
 */
export class MessageBuffer {
  private readonly queue: BoundedFifoQueue<QueuedEntry>;
  private readonly events: Emitter<MessageBufferEvents> = createEmitter();
  private seq = 0;
  private readonly laneCounts: Record<QueuedLane, number>;

  constructor(capacity: number) {
    this.queue = new BoundedFifoQueue(capacity);
    this.laneCounts = Object.fromEntries(QUEUED_LANES.map((lane) => [lane, 0])) as Record<
      QueuedLane,
      number
    >;
  }

  /**
   * Dispatch a message to the buffer.
   * Interrupt messages bypass the queue entirely.
   */
  dispatch(message: LaneMessage): void {
    if (message.lane === "interrupt") {
      this.events.emit("interrupt", message);
      return;
    }

    const lane = message.lane as QueuedLane;
    const entry: QueuedEntry = { seq: this.seq++, lane, message };
    const dropped = this.queue.enqueue(entry);

    if (dropped !== undefined) {
      this.laneCounts[dropped.lane]--;
      this.events.emit("overflow", dropped.message);
    }

    this.laneCounts[lane]++;
  }

  /**
   * Drain all messages in priority-then-FIFO order.
   *
   * Sort key: `LANE_PRIORITY[lane]` ascending, then `seq` ascending.
   * Cost: O(n log n) where n ≤ capacity (default 256) — trivial.
   */
  drain(): readonly LaneMessage[] {
    const entries = this.queue.drain() as QueuedEntry[];
    if (entries.length === 0) {
      return entries as unknown as readonly LaneMessage[];
    }

    entries.sort((a, b) => LANE_PRIORITY[a.lane] - LANE_PRIORITY[b.lane] || a.seq - b.seq);

    // Reset per-lane counters
    for (const lane of QUEUED_LANES) {
      this.laneCounts[lane] = 0;
    }

    return entries.map((e) => e.message);
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
    return this.laneCounts[lane];
  }

  /**
   * Get total messages across all lanes.
   */
  get totalQueued(): number {
    return this.queue.size;
  }
}
