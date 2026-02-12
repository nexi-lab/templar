import { describe, expect, it } from "vitest";
import { deepFreeze } from "../../freeze.js";

describe("deepFreeze", () => {
  it("freezes a shallow object", () => {
    const obj = { a: 1, b: "two" };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it("recursively freezes nested objects", () => {
    const obj = { nested: { deep: { value: 42 } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.nested)).toBe(true);
    expect(Object.isFrozen(obj.nested.deep)).toBe(true);
  });

  it("freezes arrays", () => {
    const arr = [1, 2, { inner: true }];
    deepFreeze(arr);
    expect(Object.isFrozen(arr)).toBe(true);
    expect(Object.isFrozen(arr[2])).toBe(true);
  });

  it("handles already frozen objects", () => {
    const obj = Object.freeze({ a: 1 });
    expect(() => deepFreeze(obj)).not.toThrow();
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it("passes through primitives", () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze("string")).toBe("string");
    expect(deepFreeze(true)).toBe(true);
  });

  it("returns the same reference", () => {
    const obj = { a: 1 };
    const result = deepFreeze(obj);
    expect(result).toBe(obj);
  });

  it("passes through null and undefined", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
  });

  it("freezes nested arrays of objects", () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.items)).toBe(true);
    expect(Object.isFrozen(obj.items[0])).toBe(true);
    expect(Object.isFrozen(obj.items[1])).toBe(true);
  });
});
