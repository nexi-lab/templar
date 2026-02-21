import {
  type DeliveryTrackerSnapshot,
  DeliveryTrackerSnapshotSchema,
} from "./delivery-snapshot.js";
import type { LaneMessage } from "./protocol/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingMessage {
  readonly messageId: string;
  readonly nodeId: string;
  readonly sentAt: number;
  readonly message: LaneMessage;
}

// ---------------------------------------------------------------------------
// DeliveryTracker
// ---------------------------------------------------------------------------

/**
 * Tracks lane message delivery per node.
 *
 * When the gateway successfully routes a lane.message, it is recorded here.
 * When a lane.message.ack is received, the message is marked as delivered.
 *
 * Provides:
 * - Per-node pending message tracking
 * - Unacked message retrieval (for retransmission on reconnect)
 * - Bounded memory via maxPending per node
 */
export class DeliveryTracker {
  private readonly maxPending: number;
  // nodeId → Map<messageId, PendingMessage>
  private readonly pending = new Map<string, Map<string, PendingMessage>>();

  constructor(maxPending = 1000) {
    this.maxPending = maxPending;
  }

  /**
   * Record an inbound lane message routed to a node's queue.
   */
  track(nodeId: string, message: LaneMessage): void {
    let nodePending = this.pending.get(nodeId);
    if (!nodePending) {
      nodePending = new Map();
      this.pending.set(nodeId, nodePending);
    }

    // Evict oldest if at capacity
    if (nodePending.size >= this.maxPending) {
      const oldest = nodePending.keys().next();
      if (!oldest.done && oldest.value) {
        nodePending.delete(oldest.value);
      }
    }

    nodePending.set(message.id, {
      messageId: message.id,
      nodeId,
      sentAt: Date.now(),
      message,
    });
  }

  /**
   * Acknowledge delivery of a message.
   * Returns true if the message was pending.
   */
  ack(nodeId: string, messageId: string): boolean {
    const nodePending = this.pending.get(nodeId);
    if (!nodePending) return false;
    const existed = nodePending.delete(messageId);
    if (nodePending.size === 0) {
      this.pending.delete(nodeId);
    }
    return existed;
  }

  /**
   * Get all unacked messages for a node, ordered by sent time.
   */
  unacked(nodeId: string): readonly PendingMessage[] {
    const nodePending = this.pending.get(nodeId);
    if (!nodePending) return [];
    return [...nodePending.values()].sort((a, b) => a.sentAt - b.sentAt);
  }

  /**
   * Get the count of unacked messages for a node.
   */
  pendingCount(nodeId: string): number {
    return this.pending.get(nodeId)?.size ?? 0;
  }

  /**
   * Remove all tracking for a node.
   */
  removeNode(nodeId: string): void {
    this.pending.delete(nodeId);
  }

  /**
   * Capture a serializable snapshot of all pending deliveries.
   */
  toSnapshot(): DeliveryTrackerSnapshot {
    const pending: Record<string, PendingMessage[]> = {};
    for (const [nodeId, nodePending] of this.pending) {
      pending[nodeId] = [...nodePending.values()];
    }
    return { version: 1, pending, capturedAt: Date.now() };
  }

  /**
   * Restore pending deliveries from a snapshot. Clears all existing state first.
   */
  fromSnapshot(snapshot: DeliveryTrackerSnapshot): void {
    DeliveryTrackerSnapshotSchema.parse(snapshot);
    this.pending.clear();
    for (const [nodeId, messages] of Object.entries(snapshot.pending)) {
      const nodePending = new Map<string, PendingMessage>();
      for (const msg of messages) {
        nodePending.set(msg.messageId, msg);
      }
      if (nodePending.size > 0) {
        this.pending.set(nodeId, nodePending);
      }
    }
  }

  /**
   * Clear all tracking state.
   */
  clear(): void {
    this.pending.clear();
  }
}
