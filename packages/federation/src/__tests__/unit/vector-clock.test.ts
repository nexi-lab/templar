import { describe, expect, it } from "vitest";
import { VectorClock } from "../../vector-clock/index.js";

describe("VectorClock", () => {
  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("creates an empty clock", () => {
      const vc = VectorClock.create();
      expect(vc.size).toBe(0);
      expect(vc.isEmpty).toBe(true);
    });
  });

  describe("fromJSON()", () => {
    it("reconstructs from JSON record", () => {
      const vc = VectorClock.fromJSON({ a: 1, b: 3 });
      expect(vc.get("a")).toBe(1);
      expect(vc.get("b")).toBe(3);
      expect(vc.size).toBe(2);
    });

    it("skips zero-value entries", () => {
      const vc = VectorClock.fromJSON({ a: 0, b: 2 });
      expect(vc.size).toBe(1);
      expect(vc.get("a")).toBe(0);
      expect(vc.get("b")).toBe(2);
    });

    it("throws on negative counter", () => {
      expect(() => VectorClock.fromJSON({ a: -1 })).toThrow(TypeError);
    });

    it("throws on non-integer counter", () => {
      expect(() => VectorClock.fromJSON({ a: 1.5 })).toThrow(TypeError);
    });
  });

  // -----------------------------------------------------------------------
  // Increment
  // -----------------------------------------------------------------------

  describe("increment()", () => {
    it("increments a new node from 0 to 1", () => {
      const vc = VectorClock.create().increment("a");
      expect(vc.get("a")).toBe(1);
    });

    it("increments an existing node", () => {
      const vc = VectorClock.fromJSON({ a: 3 }).increment("a");
      expect(vc.get("a")).toBe(4);
    });

    it("returns a new instance (immutability)", () => {
      const vc1 = VectorClock.create();
      const vc2 = vc1.increment("a");
      expect(vc1).not.toBe(vc2);
      expect(vc1.get("a")).toBe(0);
      expect(vc2.get("a")).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Merge
  // -----------------------------------------------------------------------

  describe("merge()", () => {
    it("merges by taking max of each counter", () => {
      const vc1 = VectorClock.fromJSON({ a: 3, b: 1 });
      const vc2 = VectorClock.fromJSON({ a: 1, b: 5, c: 2 });
      const merged = vc1.merge(vc2);

      expect(merged.get("a")).toBe(3);
      expect(merged.get("b")).toBe(5);
      expect(merged.get("c")).toBe(2);
    });

    it("merging with empty clock returns equivalent clock", () => {
      const vc1 = VectorClock.fromJSON({ a: 2 });
      const vc2 = VectorClock.create();
      const merged = vc1.merge(vc2);

      expect(merged.get("a")).toBe(2);
      expect(merged.size).toBe(1);
    });

    it("returns a new instance (immutability)", () => {
      const vc1 = VectorClock.fromJSON({ a: 1 });
      const vc2 = VectorClock.fromJSON({ b: 1 });
      const merged = vc1.merge(vc2);

      expect(merged).not.toBe(vc1);
      expect(merged).not.toBe(vc2);
    });
  });

  // -----------------------------------------------------------------------
  // Compare
  // -----------------------------------------------------------------------

  describe("compare()", () => {
    it("EQUAL: identical empty clocks", () => {
      const vc1 = VectorClock.create();
      const vc2 = VectorClock.create();
      expect(vc1.compare(vc2)).toBe("EQUAL");
    });

    it("EQUAL: identical non-empty clocks", () => {
      const vc1 = VectorClock.fromJSON({ a: 2, b: 3 });
      const vc2 = VectorClock.fromJSON({ a: 2, b: 3 });
      expect(vc1.compare(vc2)).toBe("EQUAL");
    });

    it("BEFORE: this < other on all nodes", () => {
      const vc1 = VectorClock.fromJSON({ a: 1, b: 2 });
      const vc2 = VectorClock.fromJSON({ a: 2, b: 3 });
      expect(vc1.compare(vc2)).toBe("BEFORE");
    });

    it("AFTER: this > other on all nodes", () => {
      const vc1 = VectorClock.fromJSON({ a: 3, b: 4 });
      const vc2 = VectorClock.fromJSON({ a: 2, b: 3 });
      expect(vc1.compare(vc2)).toBe("AFTER");
    });

    it("BEFORE: this has subset with lower/equal counters", () => {
      const vc1 = VectorClock.fromJSON({ a: 1 });
      const vc2 = VectorClock.fromJSON({ a: 1, b: 1 });
      expect(vc1.compare(vc2)).toBe("BEFORE");
    });

    it("AFTER: this has superset with higher/equal counters", () => {
      const vc1 = VectorClock.fromJSON({ a: 1, b: 1 });
      const vc2 = VectorClock.fromJSON({ a: 1 });
      expect(vc1.compare(vc2)).toBe("AFTER");
    });

    it("CONCURRENT: different nodes ahead", () => {
      const vc1 = VectorClock.fromJSON({ a: 2, b: 1 });
      const vc2 = VectorClock.fromJSON({ a: 1, b: 2 });
      expect(vc1.compare(vc2)).toBe("CONCURRENT");
    });

    it("CONCURRENT: disjoint node sets", () => {
      const vc1 = VectorClock.fromJSON({ a: 1 });
      const vc2 = VectorClock.fromJSON({ b: 1 });
      expect(vc1.compare(vc2)).toBe("CONCURRENT");
    });

    it("BEFORE: empty vs non-empty", () => {
      const vc1 = VectorClock.create();
      const vc2 = VectorClock.fromJSON({ a: 1 });
      expect(vc1.compare(vc2)).toBe("BEFORE");
    });

    it("AFTER: non-empty vs empty", () => {
      const vc1 = VectorClock.fromJSON({ a: 1 });
      const vc2 = VectorClock.create();
      expect(vc1.compare(vc2)).toBe("AFTER");
    });
  });

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  describe("accessors", () => {
    it("get() returns 0 for unknown node", () => {
      expect(VectorClock.create().get("x")).toBe(0);
    });

    it("nodeIds returns set of tracked nodes", () => {
      const vc = VectorClock.fromJSON({ a: 1, b: 2 });
      expect(vc.nodeIds).toEqual(new Set(["a", "b"]));
    });

    it("isEmpty returns true for empty clock", () => {
      expect(VectorClock.create().isEmpty).toBe(true);
    });

    it("isEmpty returns false for non-empty clock", () => {
      expect(VectorClock.fromJSON({ a: 1 }).isEmpty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Serialisation
  // -----------------------------------------------------------------------

  describe("serialisation", () => {
    it("toJSON() produces Record<string, number>", () => {
      const vc = VectorClock.fromJSON({ a: 1, b: 2 });
      expect(vc.toJSON()).toEqual({ a: 1, b: 2 });
    });

    it("round-trips through JSON", () => {
      const original = VectorClock.fromJSON({ x: 5, y: 3 });
      const restored = VectorClock.fromJSON(original.toJSON());
      expect(original.compare(restored)).toBe("EQUAL");
    });

    it("toString() for empty clock", () => {
      expect(VectorClock.create().toString()).toBe("VectorClock({})");
    });

    it("toString() for non-empty clock (sorted)", () => {
      const vc = VectorClock.fromJSON({ b: 2, a: 1 });
      expect(vc.toString()).toBe("VectorClock({a:1, b:2})");
    });
  });

  // -----------------------------------------------------------------------
  // Immutability
  // -----------------------------------------------------------------------

  describe("immutability", () => {
    it("Object.freeze prevents property assignment", () => {
      const vc = VectorClock.create();
      expect(() => {
        // @ts-expect-error Testing immutability
        vc.newProp = "value";
      }).toThrow();
    });
  });
});
