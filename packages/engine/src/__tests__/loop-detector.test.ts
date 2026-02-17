import { describe, expect, it } from "vitest";
import { DEFAULT_LOOP_DETECTION, LoopDetector } from "../loop-detector.js";

describe("LoopDetector", () => {
  describe("defaults", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_LOOP_DETECTION).toEqual({
        enabled: true,
        windowSize: 5,
        repeatThreshold: 3,
        maxCycleLength: 4,
        onDetected: "stop",
      });
    });
  });

  describe("disabled", () => {
    it("should return null when disabled", () => {
      const detector = new LoopDetector({ enabled: false });
      for (let i = 0; i < 10; i++) {
        expect(detector.recordAndCheck("same output", ["tool"])).toBeNull();
      }
    });
  });

  describe("output repeat detection", () => {
    it("should detect identical outputs repeated >= repeatThreshold times", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      expect(detector.recordAndCheck("same", [])).toBeNull(); // 1
      expect(detector.recordAndCheck("same", [])).toBeNull(); // 2
      const result = detector.recordAndCheck("same", []); // 3
      expect(result).not.toBeNull();
      expect(result?.type).toBe("output_repeat");
      expect(result?.repetitions).toBe(3);
    });

    it("should NOT trigger if outputs differ", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      expect(detector.recordAndCheck("a", [])).toBeNull();
      expect(detector.recordAndCheck("b", [])).toBeNull();
      expect(detector.recordAndCheck("c", [])).toBeNull();
      expect(detector.recordAndCheck("d", [])).toBeNull();
    });

    it("should reset detection when different output appears", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      detector.recordAndCheck("same", []);
      detector.recordAndCheck("same", []);
      detector.recordAndCheck("different", []); // breaks the streak
      expect(detector.recordAndCheck("same", [])).toBeNull();
    });

    it("should respect windowSize for hash sliding window", () => {
      const detector = new LoopDetector({
        repeatThreshold: 3,
        windowSize: 3,
      });
      // Fill window with identical
      detector.recordAndCheck("same", []);
      detector.recordAndCheck("same", []);
      // Different output pushes an old hash out
      detector.recordAndCheck("different", []);
      // Now even two more "same" won't fill the window with 3 identical
      detector.recordAndCheck("same", []);
      expect(detector.recordAndCheck("same", [])).toBeNull();
    });
  });

  describe("tool cycle detection", () => {
    it("should detect single-tool cycle (A, A, A)", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      expect(detector.recordAndCheck("out1", ["search"])).toBeNull();
      expect(detector.recordAndCheck("out2", ["search"])).toBeNull();
      const result = detector.recordAndCheck("out3", ["search"]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("tool_cycle");
      expect(result?.cyclePattern).toEqual(["search"]);
      expect(result?.repetitions).toBe(3);
    });

    it("should detect two-tool cycle (A, B, A, B, A, B)", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      detector.recordAndCheck("1", ["search"]);
      detector.recordAndCheck("2", ["analyze"]);
      detector.recordAndCheck("3", ["search"]);
      detector.recordAndCheck("4", ["analyze"]);
      detector.recordAndCheck("5", ["search"]);
      const result = detector.recordAndCheck("6", ["analyze"]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("tool_cycle");
      expect(result?.cyclePattern).toEqual(["search", "analyze"]);
    });

    it("should NOT detect cycle with insufficient repetitions", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      detector.recordAndCheck("1", ["search"]);
      detector.recordAndCheck("2", ["analyze"]);
      detector.recordAndCheck("3", ["search"]);
      expect(detector.recordAndCheck("4", ["analyze"])).toBeNull(); // only 2 repetitions
    });

    it("should respect maxCycleLength", () => {
      const detector = new LoopDetector({
        repeatThreshold: 2,
        maxCycleLength: 2,
      });
      // Cycle of length 3 — beyond maxCycleLength of 2
      detector.recordAndCheck("1", ["a"]);
      detector.recordAndCheck("2", ["b"]);
      detector.recordAndCheck("3", ["c"]);
      detector.recordAndCheck("4", ["a"]);
      detector.recordAndCheck("5", ["b"]);
      expect(detector.recordAndCheck("6", ["c"])).toBeNull();
    });

    it("should detect cycle within maxCycleLength", () => {
      const detector = new LoopDetector({
        repeatThreshold: 2,
        maxCycleLength: 3,
      });
      // Cycle of length 3 — within maxCycleLength
      detector.recordAndCheck("1", ["a"]);
      detector.recordAndCheck("2", ["b"]);
      detector.recordAndCheck("3", ["c"]);
      detector.recordAndCheck("4", ["a"]);
      detector.recordAndCheck("5", ["b"]);
      const result = detector.recordAndCheck("6", ["c"]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("tool_cycle");
      expect(result?.cyclePattern).toEqual(["a", "b", "c"]);
    });
  });

  describe("priority", () => {
    it("should prioritize tool cycle over output repeat", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      // Both identical output AND tool cycle
      detector.recordAndCheck("same", ["search"]);
      detector.recordAndCheck("same", ["search"]);
      const result = detector.recordAndCheck("same", ["search"]);
      expect(result).not.toBeNull();
      // Tool cycle is checked first
      expect(result?.type).toBe("tool_cycle");
    });
  });

  describe("short-circuit", () => {
    it("should return null for first few iterations below repeatThreshold", () => {
      const detector = new LoopDetector({ repeatThreshold: 5 });
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      // 5th should trigger
      expect(detector.recordAndCheck("same", ["tool"])).not.toBeNull();
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      detector.recordAndCheck("same", ["tool"]);
      detector.recordAndCheck("same", ["tool"]);
      // Almost triggered — reset now
      detector.reset();
      // Should need 3 more to trigger
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      expect(detector.recordAndCheck("same", ["tool"])).toBeNull();
      expect(detector.recordAndCheck("same", ["tool"])).not.toBeNull();
    });
  });

  describe("multiple tool calls per turn", () => {
    it("should flatten multiple tool calls into history", () => {
      const detector = new LoopDetector({
        repeatThreshold: 2,
        maxCycleLength: 2,
      });
      // Two tools per turn: [search, analyze] repeated
      detector.recordAndCheck("1", ["search", "analyze"]);
      detector.recordAndCheck("2", ["search", "analyze"]);
      detector.recordAndCheck("3", ["search", "analyze"]);
      // Should detect [search, analyze] cycle
      const result = detector.recordAndCheck("4", ["search", "analyze"]);
      // The detection happens against the flat tool history
      expect(result).not.toBeNull();
    });
  });

  describe("constructor validation", () => {
    it("should reject repeatThreshold < 2", () => {
      expect(() => new LoopDetector({ repeatThreshold: 1 })).toThrow(RangeError);
    });

    it("should reject windowSize < 1", () => {
      expect(() => new LoopDetector({ windowSize: 0 })).toThrow(RangeError);
    });

    it("should accept valid config", () => {
      expect(() => new LoopDetector({ repeatThreshold: 2, windowSize: 1 })).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle empty tool calls", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      expect(detector.recordAndCheck("a", [])).toBeNull();
      expect(detector.recordAndCheck("b", [])).toBeNull();
      expect(detector.recordAndCheck("c", [])).toBeNull();
    });

    it("should handle empty output strings", () => {
      const detector = new LoopDetector({ repeatThreshold: 3 });
      expect(detector.recordAndCheck("", [])).toBeNull();
      expect(detector.recordAndCheck("", [])).toBeNull();
      const result = detector.recordAndCheck("", []);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("output_repeat");
    });
  });
});
