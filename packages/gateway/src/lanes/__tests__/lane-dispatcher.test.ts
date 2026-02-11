import type { LaneMessage } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { LaneDispatcher } from "../lane-dispatcher.js";

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

describe("LaneDispatcher", () => {
  // -------------------------------------------------------------------------
  // Basic dispatch & drain
  // -------------------------------------------------------------------------

  describe("dispatch and drain", () => {
    it("drain returns empty when no messages", () => {
      const dispatcher = new LaneDispatcher(256);
      expect(dispatcher.drain()).toEqual([]);
    });

    it("drains steer messages", () => {
      const dispatcher = new LaneDispatcher(256);
      const msg = makeLaneMessage({ lane: "steer" });
      dispatcher.dispatch(msg);
      expect(dispatcher.drain()).toEqual([msg]);
    });

    it("drains in priority order: steer → collect → followup", () => {
      const dispatcher = new LaneDispatcher(256);
      const followup = makeLaneMessage({ id: "f1", lane: "followup" });
      const collect = makeLaneMessage({ id: "c1", lane: "collect" });
      const steer = makeLaneMessage({ id: "s1", lane: "steer" });

      // Dispatch in reverse priority order
      dispatcher.dispatch(followup);
      dispatcher.dispatch(collect);
      dispatcher.dispatch(steer);

      const drained = dispatcher.drain();
      expect(drained).toHaveLength(3);
      expect(drained[0]?.id).toBe("s1"); // steer first
      expect(drained[1]?.id).toBe("c1"); // then collect
      expect(drained[2]?.id).toBe("f1"); // then followup
    });

    it("preserves FIFO within each lane", () => {
      const dispatcher = new LaneDispatcher(256);
      const s1 = makeLaneMessage({ id: "s1", lane: "steer" });
      const s2 = makeLaneMessage({ id: "s2", lane: "steer" });
      const s3 = makeLaneMessage({ id: "s3", lane: "steer" });

      dispatcher.dispatch(s1);
      dispatcher.dispatch(s2);
      dispatcher.dispatch(s3);

      const drained = dispatcher.drain();
      expect(drained.map((m) => m.id)).toEqual(["s1", "s2", "s3"]);
    });

    it("drains all of one lane before the next", () => {
      const dispatcher = new LaneDispatcher(256);
      const s1 = makeLaneMessage({ id: "s1", lane: "steer" });
      const s2 = makeLaneMessage({ id: "s2", lane: "steer" });
      const c1 = makeLaneMessage({ id: "c1", lane: "collect" });
      const f1 = makeLaneMessage({ id: "f1", lane: "followup" });

      dispatcher.dispatch(f1);
      dispatcher.dispatch(c1);
      dispatcher.dispatch(s1);
      dispatcher.dispatch(s2);

      const drained = dispatcher.drain();
      expect(drained.map((m) => m.id)).toEqual(["s1", "s2", "c1", "f1"]);
    });

    it("drain empties all queues", () => {
      const dispatcher = new LaneDispatcher(256);
      dispatcher.dispatch(makeLaneMessage({ lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ lane: "collect" }));
      dispatcher.drain();
      expect(dispatcher.totalQueued).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Interrupt bypass
  // -------------------------------------------------------------------------

  describe("interrupt handling", () => {
    it("interrupt messages bypass all queues", () => {
      const dispatcher = new LaneDispatcher(256);
      const handler = vi.fn();
      dispatcher.onInterrupt(handler);

      const msg = makeLaneMessage({ lane: "interrupt" });
      dispatcher.dispatch(msg);

      expect(handler).toHaveBeenCalledWith(msg);
      expect(dispatcher.totalQueued).toBe(0); // not queued
    });

    it("interrupt does not appear in drain results", () => {
      const dispatcher = new LaneDispatcher(256);
      dispatcher.onInterrupt(vi.fn());
      dispatcher.dispatch(makeLaneMessage({ lane: "interrupt" }));
      expect(dispatcher.drain()).toEqual([]);
    });

    it("multiple interrupt handlers all fire", () => {
      const dispatcher = new LaneDispatcher(256);
      const h1 = vi.fn();
      const h2 = vi.fn();
      dispatcher.onInterrupt(h1);
      dispatcher.onInterrupt(h2);

      const msg = makeLaneMessage({ lane: "interrupt" });
      dispatcher.dispatch(msg);

      expect(h1).toHaveBeenCalledWith(msg);
      expect(h2).toHaveBeenCalledWith(msg);
    });

    it("interrupt with no handler does not throw", () => {
      const dispatcher = new LaneDispatcher(256);
      expect(() => dispatcher.dispatch(makeLaneMessage({ lane: "interrupt" }))).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Overflow
  // -------------------------------------------------------------------------

  describe("overflow handling", () => {
    it("calls overflow handler when lane is full", () => {
      const dispatcher = new LaneDispatcher(2);
      const handler = vi.fn();
      dispatcher.onOverflow(handler);

      dispatcher.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ id: "s2", lane: "steer" }));
      // Queue is full (capacity 2), next enqueue drops oldest
      dispatcher.dispatch(makeLaneMessage({ id: "s3", lane: "steer" }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("steer", expect.objectContaining({ id: "s1" }));
    });

    it("remaining messages after overflow are correct", () => {
      const dispatcher = new LaneDispatcher(2);
      dispatcher.onOverflow(vi.fn());

      dispatcher.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ id: "s2", lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ id: "s3", lane: "steer" }));

      const drained = dispatcher.drain();
      expect(drained.map((m) => m.id)).toEqual(["s2", "s3"]);
    });

    it("overflow on one lane does not affect others", () => {
      const dispatcher = new LaneDispatcher(1);
      const handler = vi.fn();
      dispatcher.onOverflow(handler);

      dispatcher.dispatch(makeLaneMessage({ id: "s1", lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ id: "c1", lane: "collect" }));
      // Only steer overflows
      dispatcher.dispatch(makeLaneMessage({ id: "s2", lane: "steer" }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("steer", expect.objectContaining({ id: "s1" }));

      const drained = dispatcher.drain();
      expect(drained).toHaveLength(2); // s2 + c1
    });
  });

  // -------------------------------------------------------------------------
  // Queue sizes
  // -------------------------------------------------------------------------

  describe("size tracking", () => {
    it("queueSize returns size per lane", () => {
      const dispatcher = new LaneDispatcher(256);
      dispatcher.dispatch(makeLaneMessage({ lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ lane: "collect" }));

      expect(dispatcher.queueSize("steer")).toBe(2);
      expect(dispatcher.queueSize("collect")).toBe(1);
      expect(dispatcher.queueSize("followup")).toBe(0);
    });

    it("totalQueued returns sum of all lanes", () => {
      const dispatcher = new LaneDispatcher(256);
      dispatcher.dispatch(makeLaneMessage({ lane: "steer" }));
      dispatcher.dispatch(makeLaneMessage({ lane: "collect" }));
      dispatcher.dispatch(makeLaneMessage({ lane: "followup" }));

      expect(dispatcher.totalQueued).toBe(3);
    });
  });
});
