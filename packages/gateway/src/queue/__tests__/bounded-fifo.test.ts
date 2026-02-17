import { describe, expect, it } from "vitest";
import { BoundedFifoQueue } from "../bounded-fifo.js";

describe("BoundedFifoQueue", () => {
  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("creates queue with given capacity", () => {
      const queue = new BoundedFifoQueue<number>(10);
      expect(queue.capacity).toBe(10);
      expect(queue.size).toBe(0);
    });

    it("throws on zero capacity", () => {
      expect(() => new BoundedFifoQueue(0)).toThrow(RangeError);
    });

    it("throws on negative capacity", () => {
      expect(() => new BoundedFifoQueue(-1)).toThrow(RangeError);
    });
  });

  // -------------------------------------------------------------------------
  // Enqueue / Dequeue
  // -------------------------------------------------------------------------

  describe("enqueue / dequeue", () => {
    it("enqueue returns undefined when not full", () => {
      const queue = new BoundedFifoQueue<number>(3);
      expect(queue.enqueue(1)).toBeUndefined();
      expect(queue.enqueue(2)).toBeUndefined();
      expect(queue.enqueue(3)).toBeUndefined();
    });

    it("dequeue returns items in FIFO order", () => {
      const queue = new BoundedFifoQueue<string>(5);
      queue.enqueue("a");
      queue.enqueue("b");
      queue.enqueue("c");
      expect(queue.dequeue()).toBe("a");
      expect(queue.dequeue()).toBe("b");
      expect(queue.dequeue()).toBe("c");
    });

    it("dequeue returns undefined when empty", () => {
      const queue = new BoundedFifoQueue<number>(5);
      expect(queue.dequeue()).toBeUndefined();
    });

    it("alternating enqueue/dequeue", () => {
      const queue = new BoundedFifoQueue<number>(2);
      queue.enqueue(1);
      expect(queue.dequeue()).toBe(1);
      queue.enqueue(2);
      queue.enqueue(3);
      expect(queue.dequeue()).toBe(2);
      expect(queue.dequeue()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Overflow (drop-oldest)
  // -------------------------------------------------------------------------

  describe("overflow behavior", () => {
    it("drops oldest on overflow and returns it", () => {
      const queue = new BoundedFifoQueue<string>(2);
      queue.enqueue("a");
      queue.enqueue("b");
      const dropped = queue.enqueue("c");
      expect(dropped).toBe("a");
      expect(queue.size).toBe(2);
    });

    it("remaining items are correct after overflow", () => {
      const queue = new BoundedFifoQueue<string>(2);
      queue.enqueue("a");
      queue.enqueue("b");
      queue.enqueue("c"); // drops "a"
      expect(queue.dequeue()).toBe("b");
      expect(queue.dequeue()).toBe("c");
    });

    it("multiple overflows", () => {
      const queue = new BoundedFifoQueue<number>(1);
      expect(queue.enqueue(1)).toBeUndefined();
      expect(queue.enqueue(2)).toBe(1);
      expect(queue.enqueue(3)).toBe(2);
      expect(queue.dequeue()).toBe(3);
    });

    it("capacity 1 queue always holds most recent item", () => {
      const queue = new BoundedFifoQueue<string>(1);
      queue.enqueue("x");
      queue.enqueue("y");
      queue.enqueue("z");
      expect(queue.dequeue()).toBe("z");
    });
  });

  // -------------------------------------------------------------------------
  // Peek
  // -------------------------------------------------------------------------

  describe("peek", () => {
    it("returns oldest item without removing", () => {
      const queue = new BoundedFifoQueue<number>(5);
      queue.enqueue(1);
      queue.enqueue(2);
      expect(queue.peek()).toBe(1);
      expect(queue.size).toBe(2);
    });

    it("returns undefined when empty", () => {
      const queue = new BoundedFifoQueue<number>(5);
      expect(queue.peek()).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Drain
  // -------------------------------------------------------------------------

  describe("drain", () => {
    it("returns all items in FIFO order", () => {
      const queue = new BoundedFifoQueue<number>(5);
      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3);
      expect(queue.drain()).toEqual([1, 2, 3]);
    });

    it("empties the queue", () => {
      const queue = new BoundedFifoQueue<number>(5);
      queue.enqueue(1);
      queue.enqueue(2);
      queue.drain();
      expect(queue.size).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });

    it("returns empty array when empty", () => {
      const queue = new BoundedFifoQueue<number>(5);
      expect(queue.drain()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Property getters
  // -------------------------------------------------------------------------

  describe("property getters", () => {
    it("size tracks correctly", () => {
      const queue = new BoundedFifoQueue<number>(5);
      expect(queue.size).toBe(0);
      queue.enqueue(1);
      expect(queue.size).toBe(1);
      queue.enqueue(2);
      expect(queue.size).toBe(2);
      queue.dequeue();
      expect(queue.size).toBe(1);
    });

    it("isFull is correct", () => {
      const queue = new BoundedFifoQueue<number>(2);
      expect(queue.isFull).toBe(false);
      queue.enqueue(1);
      expect(queue.isFull).toBe(false);
      queue.enqueue(2);
      expect(queue.isFull).toBe(true);
    });

    it("isEmpty is correct", () => {
      const queue = new BoundedFifoQueue<number>(2);
      expect(queue.isEmpty).toBe(true);
      queue.enqueue(1);
      expect(queue.isEmpty).toBe(false);
      queue.dequeue();
      expect(queue.isEmpty).toBe(true);
    });
  });
});
