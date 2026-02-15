import { describe, expect, it, vi } from "vitest";
import { DeliveryTracker } from "../delivery-tracker.js";
import type { LaneMessage } from "../protocol/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMessage(id: string, lane: "steer" | "collect" | "followup" = "steer"): LaneMessage {
  return {
    id,
    lane,
    channelId: "ch-1",
    payload: { text: `msg-${id}` },
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeliveryTracker", () => {
  // -------------------------------------------------------------------------
  // Basic tracking
  // -------------------------------------------------------------------------

  describe("track and ack", () => {
    it("tracks a message as pending", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));

      expect(tracker.pendingCount("node-1")).toBe(1);
      expect(tracker.unacked("node-1")).toHaveLength(1);
      expect(tracker.unacked("node-1")[0]?.messageId).toBe("msg-1");
    });

    it("ack removes message from pending", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));

      const result = tracker.ack("node-1", "msg-1");

      expect(result).toBe(true);
      expect(tracker.pendingCount("node-1")).toBe(0);
      expect(tracker.unacked("node-1")).toHaveLength(0);
    });

    it("ack returns false for unknown message", () => {
      const tracker = new DeliveryTracker();
      expect(tracker.ack("node-1", "msg-unknown")).toBe(false);
    });

    it("ack returns false for unknown node", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      expect(tracker.ack("node-2", "msg-1")).toBe(false);
    });

    it("tracks multiple messages per node", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-1", createMessage("msg-2"));
      tracker.track("node-1", createMessage("msg-3"));

      expect(tracker.pendingCount("node-1")).toBe(3);
    });

    it("tracks messages for multiple nodes independently", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-2", createMessage("msg-2"));

      expect(tracker.pendingCount("node-1")).toBe(1);
      expect(tracker.pendingCount("node-2")).toBe(1);

      tracker.ack("node-1", "msg-1");

      expect(tracker.pendingCount("node-1")).toBe(0);
      expect(tracker.pendingCount("node-2")).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Ordering
  // -------------------------------------------------------------------------

  describe("ordering", () => {
    it("returns unacked messages ordered by sent time", () => {
      vi.useFakeTimers();
      const tracker = new DeliveryTracker();

      vi.setSystemTime(1000);
      tracker.track("node-1", createMessage("msg-a"));
      vi.setSystemTime(2000);
      tracker.track("node-1", createMessage("msg-b"));
      vi.setSystemTime(3000);
      tracker.track("node-1", createMessage("msg-c"));

      const unacked = tracker.unacked("node-1");
      expect(unacked.map((m) => m.messageId)).toEqual(["msg-a", "msg-b", "msg-c"]);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Capacity
  // -------------------------------------------------------------------------

  describe("capacity", () => {
    it("evicts oldest when maxPending is reached", () => {
      const tracker = new DeliveryTracker(3);

      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-1", createMessage("msg-2"));
      tracker.track("node-1", createMessage("msg-3"));
      tracker.track("node-1", createMessage("msg-4")); // evicts msg-1

      expect(tracker.pendingCount("node-1")).toBe(3);
      const ids = tracker.unacked("node-1").map((m) => m.messageId);
      expect(ids).not.toContain("msg-1");
      expect(ids).toContain("msg-4");
    });

    it("maxPending is per-node", () => {
      const tracker = new DeliveryTracker(2);

      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-1", createMessage("msg-2"));
      tracker.track("node-2", createMessage("msg-3"));
      tracker.track("node-2", createMessage("msg-4"));

      expect(tracker.pendingCount("node-1")).toBe(2);
      expect(tracker.pendingCount("node-2")).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("cleanup", () => {
    it("removeNode clears all pending for that node", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-1", createMessage("msg-2"));
      tracker.track("node-2", createMessage("msg-3"));

      tracker.removeNode("node-1");

      expect(tracker.pendingCount("node-1")).toBe(0);
      expect(tracker.pendingCount("node-2")).toBe(1);
    });

    it("clear removes all state", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      tracker.track("node-2", createMessage("msg-2"));

      tracker.clear();

      expect(tracker.pendingCount("node-1")).toBe(0);
      expect(tracker.pendingCount("node-2")).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("pendingCount returns 0 for unknown node", () => {
      const tracker = new DeliveryTracker();
      expect(tracker.pendingCount("unknown")).toBe(0);
    });

    it("unacked returns empty array for unknown node", () => {
      const tracker = new DeliveryTracker();
      expect(tracker.unacked("unknown")).toEqual([]);
    });

    it("tracks same message id replacement", () => {
      const tracker = new DeliveryTracker();
      const msg1 = createMessage("msg-1");
      tracker.track("node-1", msg1);
      tracker.track("node-1", msg1); // same id, overwrites

      expect(tracker.pendingCount("node-1")).toBe(1);
    });

    it("cleans up node map entry when last message is acked", () => {
      const tracker = new DeliveryTracker();
      tracker.track("node-1", createMessage("msg-1"));
      tracker.ack("node-1", "msg-1");

      // Internal map entry should be cleaned up
      expect(tracker.pendingCount("node-1")).toBe(0);
    });
  });
});
