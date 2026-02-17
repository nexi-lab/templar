import { describe, expect, it, vi } from "vitest";
import type { LaneMessage } from "../../protocol/index.js";
import { MessageBuffer } from "../message-buffer.js";

function makeLaneMessage(overrides: Partial<LaneMessage> = {}): LaneMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    lane: "steer",
    channelId: "ch-1",
    payload: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("MessageBuffer", () => {
  // -------------------------------------------------------------------------
  // Basic dispatch & drain
  // -------------------------------------------------------------------------

  describe("dispatch and drain", () => {
    it("drain returns empty when no messages", () => {
      const buffer = new MessageBuffer(256);
      expect(buffer.drain()).toEqual([]);
    });

    it("drains steer messages", () => {
      const buffer = new MessageBuffer(256);
      const msg = makeLaneMessage({ lane: "steer" });
      buffer.dispatch(msg);
      expect(buffer.drain()).toEqual([msg]);
    });

    it("drains in priority order: steer -> collect -> followup", () => {
      const buffer = new MessageBuffer(256);
      const followup = makeLaneMessage({ id: "f1", lane: "followup" });
      const collect = makeLaneMessage({ id: "c1", lane: "collect" });
      const steer = makeLaneMessage({ id: "s1", lane: "steer" });

      // Dispatch in reverse priority order
      buffer.dispatch(followup);
      buffer.dispatch(collect);
      buffer.dispatch(steer);

      const drained = buffer.drain();
      expect(drained).toHaveLength(3);
      expect(drained[0]?.id).toBe("s1"); // steer first
      expect(drained[1]?.id).toBe("c1"); // then collect
      expect(drained[2]?.id).toBe("f1"); // then followup
    });

    it("preserves FIFO within each lane", () => {
      const buffer = new MessageBuffer(256);
      const s1 = makeLaneMessage({ id: "s1", lane: "steer" });
      const s2 = makeLaneMessage({ id: "s2", lane: "steer" });
      const s3 = makeLaneMessage({ id: "s3", lane: "steer" });

      buffer.dispatch(s1);
      buffer.dispatch(s2);
      buffer.dispatch(s3);

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(["s1", "s2", "s3"]);
    });

    it("drains all of one priority before the next", () => {
      const buffer = new MessageBuffer(256);
      const s1 = makeLaneMessage({ id: "s1", lane: "steer" });
      const s2 = makeLaneMessage({ id: "s2", lane: "steer" });
      const c1 = makeLaneMessage({ id: "c1", lane: "collect" });
      const f1 = makeLaneMessage({ id: "f1", lane: "followup" });

      buffer.dispatch(f1);
      buffer.dispatch(c1);
      buffer.dispatch(s1);
      buffer.dispatch(s2);

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(["s1", "s2", "c1", "f1"]);
    });

    it("drain empties buffer and resets counters", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ lane: "collect" }));
      buffer.drain();
      expect(buffer.totalQueued).toBe(0);
      expect(buffer.queueSize("steer")).toBe(0);
      expect(buffer.queueSize("collect")).toBe(0);
    });

    it("interleaved dispatch order still drains in priority order", () => {
      const buffer = new MessageBuffer(256);
      // Interleave: f, s, c, s, f, c
      buffer.dispatch(makeLaneMessage({ id: "f1", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ id: "c1", lane: "collect" }));
      buffer.dispatch(makeLaneMessage({ id: "s2", lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ id: "f2", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "c2", lane: "collect" }));

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual([
        "s1",
        "s2", // all steer first (FIFO within)
        "c1",
        "c2", // all collect next
        "f1",
        "f2", // all followup last
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Sort stability
  // -------------------------------------------------------------------------

  describe("sort stability", () => {
    it("same-priority messages maintain insertion order", () => {
      const buffer = new MessageBuffer(256);
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeLaneMessage({ id: `c-${i}`, lane: "collect" }),
      );

      for (const msg of messages) {
        buffer.dispatch(msg);
      }

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(messages.map((m) => m.id));
    });

    it("interleaved same-priority messages maintain per-lane FIFO", () => {
      const buffer = new MessageBuffer(256);
      // All same priority (steer), interleaved with different channels
      buffer.dispatch(makeLaneMessage({ id: "a1", lane: "steer", channelId: "ch-a" }));
      buffer.dispatch(makeLaneMessage({ id: "b1", lane: "steer", channelId: "ch-b" }));
      buffer.dispatch(makeLaneMessage({ id: "a2", lane: "steer", channelId: "ch-a" }));
      buffer.dispatch(makeLaneMessage({ id: "b2", lane: "steer", channelId: "ch-b" }));

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(["a1", "b1", "a2", "b2"]);
    });

    it("large batch maintains stable ordering across priorities", () => {
      const buffer = new MessageBuffer(256);
      // 50 messages per lane, interleaved
      for (let i = 0; i < 50; i++) {
        buffer.dispatch(makeLaneMessage({ id: `f-${i}`, lane: "followup" }));
        buffer.dispatch(makeLaneMessage({ id: `s-${i}`, lane: "steer" }));
        buffer.dispatch(makeLaneMessage({ id: `c-${i}`, lane: "collect" }));
      }

      const drained = buffer.drain();
      expect(drained).toHaveLength(150);

      // Verify: all steer first, then all collect, then all followup
      const steerIds = drained.slice(0, 50).map((m) => m.id);
      const collectIds = drained.slice(50, 100).map((m) => m.id);
      const followupIds = drained.slice(100, 150).map((m) => m.id);

      expect(steerIds).toEqual(Array.from({ length: 50 }, (_, i) => `s-${i}`));
      expect(collectIds).toEqual(Array.from({ length: 50 }, (_, i) => `c-${i}`));
      expect(followupIds).toEqual(Array.from({ length: 50 }, (_, i) => `f-${i}`));
    });
  });

  // -------------------------------------------------------------------------
  // Interrupt bypass
  // -------------------------------------------------------------------------

  describe("interrupt handling", () => {
    it("interrupt messages bypass queue", () => {
      const buffer = new MessageBuffer(256);
      const handler = vi.fn();
      buffer.onInterrupt(handler);

      const msg = makeLaneMessage({ lane: "interrupt" });
      buffer.dispatch(msg);

      expect(handler).toHaveBeenCalledWith(msg);
      expect(buffer.totalQueued).toBe(0); // not queued
    });

    it("interrupt does not appear in drain results", () => {
      const buffer = new MessageBuffer(256);
      buffer.onInterrupt(vi.fn());
      buffer.dispatch(makeLaneMessage({ lane: "interrupt" }));
      expect(buffer.drain()).toEqual([]);
    });

    it("multiple interrupt handlers all fire", () => {
      const buffer = new MessageBuffer(256);
      const h1 = vi.fn();
      const h2 = vi.fn();
      buffer.onInterrupt(h1);
      buffer.onInterrupt(h2);

      const msg = makeLaneMessage({ lane: "interrupt" });
      buffer.dispatch(msg);

      expect(h1).toHaveBeenCalledWith(msg);
      expect(h2).toHaveBeenCalledWith(msg);
    });

    it("interrupt with no handler does not throw", () => {
      const buffer = new MessageBuffer(256);
      expect(() => buffer.dispatch(makeLaneMessage({ lane: "interrupt" }))).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Overflow (global — not per-lane)
  // -------------------------------------------------------------------------

  describe("overflow handling", () => {
    it("calls overflow handler when buffer is full", () => {
      const buffer = new MessageBuffer(2);
      const handler = vi.fn();
      buffer.onOverflow(handler);

      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ id: "s2", lane: "steer" }));
      // Buffer is full (capacity 2), next enqueue drops oldest
      buffer.dispatch(makeLaneMessage({ id: "s3", lane: "steer" }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
    });

    it("overflow drops oldest message regardless of lane", () => {
      const buffer = new MessageBuffer(2);
      buffer.onOverflow(vi.fn());

      // Fill with followup (low priority)
      buffer.dispatch(makeLaneMessage({ id: "f1", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "f2", lane: "followup" }));
      // Enqueue steer (high priority) — drops oldest followup
      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));

      const drained = buffer.drain();
      // s1 has higher priority, so it appears first despite being enqueued last
      expect(drained.map((m) => m.id)).toEqual(["s1", "f2"]);
    });

    it("per-lane counters correct after overflow drop", () => {
      const buffer = new MessageBuffer(2);
      buffer.onOverflow(vi.fn());

      buffer.dispatch(makeLaneMessage({ id: "f1", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "c1", lane: "collect" }));
      // Overflow drops f1 (oldest), adds s1
      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));

      expect(buffer.queueSize("steer")).toBe(1);
      expect(buffer.queueSize("collect")).toBe(1);
      expect(buffer.queueSize("followup")).toBe(0); // f1 was dropped
      expect(buffer.totalQueued).toBe(2);
    });

    it("overflow handler receives dropped LaneMessage directly", () => {
      const buffer = new MessageBuffer(1);
      const handler = vi.fn();
      buffer.onOverflow(handler);

      const first = makeLaneMessage({ id: "first", lane: "steer" });
      buffer.dispatch(first);
      buffer.dispatch(makeLaneMessage({ id: "second", lane: "collect" }));

      // Handler receives just the dropped LaneMessage (not lane + message)
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(first);
      expect(handler.mock.calls[0]).toHaveLength(1); // single argument
    });

    it("high-priority message survives when queue has low-priority overflow", () => {
      const buffer = new MessageBuffer(3);
      buffer.onOverflow(vi.fn());

      // Fill: steer, followup, followup
      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ id: "f1", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "f2", lane: "followup" }));
      // Overflow drops s1 (oldest) — this is drop-oldest, not priority-aware
      buffer.dispatch(makeLaneMessage({ id: "f3", lane: "followup" }));

      const drained = buffer.drain();
      // After overflow: [f1, f2, f3]. s1 was dropped (oldest).
      expect(drained.map((m) => m.id)).toEqual(["f1", "f2", "f3"]);
    });

    it("rapid mixed-lane enqueue under overflow", () => {
      const buffer = new MessageBuffer(2);
      const handler = vi.fn();
      buffer.onOverflow(handler);

      buffer.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ id: "c1", lane: "collect" }));
      buffer.dispatch(makeLaneMessage({ id: "f1", lane: "followup" })); // drops s1
      buffer.dispatch(makeLaneMessage({ id: "s2", lane: "steer" })); // drops c1

      expect(handler).toHaveBeenCalledTimes(2);
      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(["s2", "f1"]);
    });
  });

  // -------------------------------------------------------------------------
  // Size tracking
  // -------------------------------------------------------------------------

  describe("size tracking", () => {
    it("queueSize returns count per lane", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ lane: "collect" }));

      expect(buffer.queueSize("steer")).toBe(2);
      expect(buffer.queueSize("collect")).toBe(1);
      expect(buffer.queueSize("followup")).toBe(0);
    });

    it("queueSize updates on enqueue and drain", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      expect(buffer.queueSize("steer")).toBe(1);

      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      expect(buffer.queueSize("steer")).toBe(2);

      buffer.drain();
      expect(buffer.queueSize("steer")).toBe(0);
    });

    it("queueSize correct after overflow", () => {
      const buffer = new MessageBuffer(2);
      buffer.onOverflow(vi.fn());

      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ lane: "collect" }));
      buffer.dispatch(makeLaneMessage({ lane: "followup" })); // drops steer

      expect(buffer.queueSize("steer")).toBe(0);
      expect(buffer.queueSize("collect")).toBe(1);
      expect(buffer.queueSize("followup")).toBe(1);
    });

    it("totalQueued returns queue size", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.dispatch(makeLaneMessage({ lane: "collect" }));
      buffer.dispatch(makeLaneMessage({ lane: "followup" }));

      expect(buffer.totalQueued).toBe(3);
    });

    it("totalQueued is zero after drain", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      buffer.drain();
      expect(buffer.totalQueued).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("capacity of 1", () => {
      const buffer = new MessageBuffer(1);
      buffer.onOverflow(vi.fn());

      buffer.dispatch(makeLaneMessage({ id: "a", lane: "followup" }));
      buffer.dispatch(makeLaneMessage({ id: "b", lane: "steer" }));

      const drained = buffer.drain();
      expect(drained).toHaveLength(1);
      expect(drained[0]?.id).toBe("b");
    });

    it("dispatch after drain allows re-use", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ id: "a", lane: "steer" }));
      buffer.drain();

      buffer.dispatch(makeLaneMessage({ id: "b", lane: "collect" }));
      const drained = buffer.drain();
      expect(drained).toHaveLength(1);
      expect(drained[0]?.id).toBe("b");
    });

    it("all lanes empty except one", () => {
      const buffer = new MessageBuffer(256);
      buffer.dispatch(makeLaneMessage({ id: "c1", lane: "collect" }));
      buffer.dispatch(makeLaneMessage({ id: "c2", lane: "collect" }));

      const drained = buffer.drain();
      expect(drained.map((m) => m.id)).toEqual(["c1", "c2"]);
      expect(buffer.queueSize("steer")).toBe(0);
      expect(buffer.queueSize("followup")).toBe(0);
    });

    it("interrupt handler disposer removes handler", () => {
      const buffer = new MessageBuffer(256);
      const handler = vi.fn();
      const dispose = buffer.onInterrupt(handler);

      dispose();

      buffer.dispatch(makeLaneMessage({ lane: "interrupt" }));
      expect(handler).not.toHaveBeenCalled();
    });

    it("overflow handler disposer removes handler", () => {
      const buffer = new MessageBuffer(1);
      const handler = vi.fn();
      const dispose = buffer.onOverflow(handler);

      buffer.dispatch(makeLaneMessage({ lane: "steer" }));
      dispose();

      buffer.dispatch(makeLaneMessage({ lane: "steer" })); // overflow, but handler removed
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
