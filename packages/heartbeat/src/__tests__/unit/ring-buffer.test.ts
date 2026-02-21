import { describe, expect, it } from "vitest";
import { RingBuffer } from "../../ring-buffer.js";

describe("RingBuffer", () => {
  it("should create with given capacity", () => {
    const buf = new RingBuffer<number>(10);
    expect(buf.capacity).toBe(10);
    expect(buf.size).toBe(0);
  });

  it("should throw on invalid capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(-1)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });

  it("should push items and track size", () => {
    const buf = new RingBuffer<string>(5);
    buf.push("a");
    buf.push("b");
    expect(buf.size).toBe(2);
    expect(buf.toArray()).toEqual(["a", "b"]);
  });

  it("should return frozen array from toArray", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    const arr = buf.toArray();
    expect(Object.isFrozen(arr)).toBe(true);
  });

  it("should return frozen empty array when empty", () => {
    const buf = new RingBuffer<number>(3);
    const arr = buf.toArray();
    expect(arr).toEqual([]);
    expect(Object.isFrozen(arr)).toBe(true);
  });

  it("should drop oldest entries on overflow", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // drops 1
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it("should handle wrap-around correctly", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    buf.push(5); // drops 1,2
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });

  it("should handle capacity of 1", () => {
    const buf = new RingBuffer<string>(1);
    buf.push("a");
    expect(buf.toArray()).toEqual(["a"]);
    buf.push("b");
    expect(buf.toArray()).toEqual(["b"]);
    expect(buf.size).toBe(1);
  });

  it("should clear all entries", () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("should work correctly after clear", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    buf.push(10);
    buf.push(20);
    expect(buf.toArray()).toEqual([10, 20]);
  });
});
