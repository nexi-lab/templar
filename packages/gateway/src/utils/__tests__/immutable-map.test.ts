import { describe, expect, it } from "vitest";
import { mapDelete, mapFilter, mapSet } from "../immutable-map.js";

describe("mapSet", () => {
  it("adds a new entry", () => {
    const original: ReadonlyMap<string, number> = new Map();
    const result = mapSet(original, "a", 1);
    expect(result.get("a")).toBe(1);
    expect(original.size).toBe(0);
  });

  it("updates an existing entry", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1]]);
    const result = mapSet(original, "a", 2);
    expect(result.get("a")).toBe(2);
    expect(original.get("a")).toBe(1);
  });

  it("does not mutate the original map", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1]]);
    mapSet(original, "b", 2);
    expect(original.size).toBe(1);
  });
});

describe("mapDelete", () => {
  it("removes an existing entry", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1], ["b", 2]]);
    const result = mapDelete(original, "a");
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(2);
    expect(original.has("a")).toBe(true);
  });

  it("returns a new map even if key does not exist", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1]]);
    const result = mapDelete(original, "nonexistent");
    expect(result.size).toBe(1);
    expect(result).not.toBe(original);
  });

  it("does not mutate the original map", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1]]);
    mapDelete(original, "a");
    expect(original.has("a")).toBe(true);
  });
});

describe("mapFilter", () => {
  it("filters entries by predicate", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1], ["b", 2], ["c", 3]]);
    const result = mapFilter(original, (_k, v) => v > 1);
    expect(result.size).toBe(2);
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(3);
  });

  it("returns empty map when no entries match", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1]]);
    const result = mapFilter(original, () => false);
    expect(result.size).toBe(0);
  });

  it("returns all entries when all match", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1], ["b", 2]]);
    const result = mapFilter(original, () => true);
    expect(result.size).toBe(2);
  });

  it("does not mutate the original map", () => {
    const original: ReadonlyMap<string, number> = new Map([["a", 1], ["b", 2]]);
    mapFilter(original, (_k, v) => v === 1);
    expect(original.size).toBe(2);
  });

  it("provides key and value to predicate", () => {
    const original: ReadonlyMap<string, number> = new Map([["keep", 1], ["drop", 2]]);
    const result = mapFilter(original, (k) => k === "keep");
    expect(result.size).toBe(1);
    expect(result.has("keep")).toBe(true);
  });
});
