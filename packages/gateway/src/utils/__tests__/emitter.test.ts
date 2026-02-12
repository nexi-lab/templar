import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "../emitter.js";

type TestEvents = {
  message: [text: string];
  count: [n: number];
  multi: [a: string, b: number];
  empty: [];
};

describe("createEmitter", () => {
  // -------------------------------------------------------------------------
  // on / emit basics
  // -------------------------------------------------------------------------

  describe("on / emit", () => {
    it("calls handler when event is emitted", () => {
      const emitter = createEmitter<TestEvents>();
      const handler = vi.fn();
      emitter.on("message", handler);
      emitter.emit("message", "hello");
      expect(handler).toHaveBeenCalledWith("hello");
    });

    it("passes multiple args to handler", () => {
      const emitter = createEmitter<TestEvents>();
      const handler = vi.fn();
      emitter.on("multi", handler);
      emitter.emit("multi", "a", 42);
      expect(handler).toHaveBeenCalledWith("a", 42);
    });

    it("supports zero-arg events", () => {
      const emitter = createEmitter<TestEvents>();
      const handler = vi.fn();
      emitter.on("empty", handler);
      emitter.emit("empty");
      expect(handler).toHaveBeenCalledOnce();
    });

    it("calls multiple handlers in registration order", () => {
      const emitter = createEmitter<TestEvents>();
      const order: number[] = [];
      emitter.on("message", () => order.push(1));
      emitter.on("message", () => order.push(2));
      emitter.on("message", () => order.push(3));
      emitter.emit("message", "test");
      expect(order).toEqual([1, 2, 3]);
    });

    it("does not call handlers for other events", () => {
      const emitter = createEmitter<TestEvents>();
      const handler = vi.fn();
      emitter.on("message", handler);
      emitter.emit("count", 42);
      expect(handler).not.toHaveBeenCalled();
    });

    it("no-op when emitting event with no handlers", () => {
      const emitter = createEmitter<TestEvents>();
      expect(() => emitter.emit("message", "hello")).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Disposer
  // -------------------------------------------------------------------------

  describe("disposer", () => {
    it("returns a disposer function from on()", () => {
      const emitter = createEmitter<TestEvents>();
      const dispose = emitter.on("message", vi.fn());
      expect(typeof dispose).toBe("function");
    });

    it("removes handler when disposer is called", () => {
      const emitter = createEmitter<TestEvents>();
      const handler = vi.fn();
      const dispose = emitter.on("message", handler);
      dispose();
      emitter.emit("message", "hello");
      expect(handler).not.toHaveBeenCalled();
    });

    it("is idempotent — calling twice does not throw", () => {
      const emitter = createEmitter<TestEvents>();
      const dispose = emitter.on("message", vi.fn());
      dispose();
      expect(() => dispose()).not.toThrow();
    });

    it("only removes the specific handler, not others", () => {
      const emitter = createEmitter<TestEvents>();
      const h1 = vi.fn();
      const h2 = vi.fn();
      const dispose1 = emitter.on("message", h1);
      emitter.on("message", h2);
      dispose1();
      emitter.emit("message", "hello");
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledWith("hello");
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  describe("error isolation", () => {
    it("continues calling remaining handlers when one throws", () => {
      const emitter = createEmitter<TestEvents>();
      const h1 = vi.fn();
      const h2 = vi.fn(() => {
        throw new Error("boom");
      });
      const h3 = vi.fn();
      emitter.on("message", h1);
      emitter.on("message", h2);
      emitter.on("message", h3);
      emitter.emit("message", "test");
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
      expect(h3).toHaveBeenCalled();
    });

    it("does not throw from emit when handler throws", () => {
      const emitter = createEmitter<TestEvents>();
      emitter.on("message", () => {
        throw new Error("boom");
      });
      expect(() => emitter.emit("message", "test")).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Snapshot semantics
  // -------------------------------------------------------------------------

  describe("snapshot semantics", () => {
    it("handler registered during emit is not called in current emit", () => {
      const emitter = createEmitter<TestEvents>();
      const lateHandler = vi.fn();
      emitter.on("message", () => {
        emitter.on("message", lateHandler);
      });
      emitter.emit("message", "test");
      expect(lateHandler).not.toHaveBeenCalled();
    });

    it("handler removed during emit still runs in current emit", () => {
      const emitter = createEmitter<TestEvents>();
      const h2 = vi.fn();
      let dispose2: (() => void) | undefined;
      emitter.on("message", () => {
        dispose2?.();
      });
      dispose2 = emitter.on("message", h2);
      emitter.emit("message", "test");
      // h2 still runs because we iterate over a snapshot
      expect(h2).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe("clear", () => {
    it("removes all handlers for a specific event", () => {
      const emitter = createEmitter<TestEvents>();
      const h1 = vi.fn();
      const h2 = vi.fn();
      emitter.on("message", h1);
      emitter.on("count", h2);
      emitter.clear("message");
      emitter.emit("message", "test");
      emitter.emit("count", 42);
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    it("removes all handlers when no event specified", () => {
      const emitter = createEmitter<TestEvents>();
      const h1 = vi.fn();
      const h2 = vi.fn();
      emitter.on("message", h1);
      emitter.on("count", h2);
      emitter.clear();
      emitter.emit("message", "test");
      emitter.emit("count", 42);
      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // count
  // -------------------------------------------------------------------------

  describe("count", () => {
    it("returns 0 for events with no handlers", () => {
      const emitter = createEmitter<TestEvents>();
      expect(emitter.count("message")).toBe(0);
    });

    it("returns correct count after registration", () => {
      const emitter = createEmitter<TestEvents>();
      emitter.on("message", vi.fn());
      emitter.on("message", vi.fn());
      expect(emitter.count("message")).toBe(2);
    });

    it("decrements after disposer call", () => {
      const emitter = createEmitter<TestEvents>();
      const dispose = emitter.on("message", vi.fn());
      expect(emitter.count("message")).toBe(1);
      dispose();
      expect(emitter.count("message")).toBe(0);
    });
  });
});
