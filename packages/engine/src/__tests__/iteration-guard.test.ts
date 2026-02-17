import { ExecutionTimeoutError, IterationLimitError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EXECUTION_LIMITS, IterationGuard } from "../iteration-guard.js";

describe("IterationGuard", () => {
  describe("defaults", () => {
    it("should use default maxIterations of 25", () => {
      const guard = new IterationGuard();
      expect(guard.max).toBe(DEFAULT_EXECUTION_LIMITS.maxIterations);
      expect(guard.max).toBe(25);
    });

    it("should start with count 0", () => {
      const guard = new IterationGuard();
      expect(guard.count).toBe(0);
    });

    it("should track elapsed time", () => {
      const guard = new IterationGuard();
      expect(guard.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("check()", () => {
    it("should increment count on each call", () => {
      const guard = new IterationGuard({ maxIterations: 10 });
      guard.check();
      expect(guard.count).toBe(1);
      guard.check();
      expect(guard.count).toBe(2);
    });

    it("should allow exactly maxIterations calls", () => {
      const guard = new IterationGuard({ maxIterations: 3 });
      guard.check(); // 1
      guard.check(); // 2
      guard.check(); // 3
      expect(guard.count).toBe(3);
    });

    it("should throw IterationLimitError on maxIterations + 1", () => {
      const guard = new IterationGuard({ maxIterations: 2 });
      guard.check(); // 1
      guard.check(); // 2
      expect(() => guard.check()).toThrow(IterationLimitError);
    });

    it("should include count and max in IterationLimitError", () => {
      const guard = new IterationGuard({ maxIterations: 1 });
      guard.check(); // 1
      try {
        guard.check(); // 2 > 1
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(IterationLimitError);
        const e = error as IterationLimitError;
        expect(e.iterationCount).toBe(2);
        expect(e.maxIterations).toBe(1);
      }
    });

    it("should throw ExecutionTimeoutError when time exceeded", () => {
      // Mock Date.now to simulate time passing
      const realNow = Date.now;
      let currentTime = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      const guard = new IterationGuard({ maxExecutionTimeMs: 100 });

      // Advance time past limit
      currentTime = 1200; // 200ms elapsed, limit is 100ms
      expect(() => guard.check()).toThrow(ExecutionTimeoutError);

      Date.now = realNow;
      vi.restoreAllMocks();
    });

    it("should check time before iterations", () => {
      const realNow = Date.now;
      let currentTime = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      // Both limits would be exceeded, but time is checked first
      const guard = new IterationGuard({
        maxIterations: 1,
        maxExecutionTimeMs: 50,
      });

      guard.check(); // iteration 1, time OK
      currentTime = 1100; // 100ms elapsed, limit is 50ms

      // Should throw timeout, not iteration limit
      expect(() => guard.check()).toThrow(ExecutionTimeoutError);

      Date.now = realNow;
      vi.restoreAllMocks();
    });
  });

  describe("constructor validation", () => {
    it("should reject maxIterations < 1", () => {
      expect(() => new IterationGuard({ maxIterations: 0 })).toThrow(RangeError);
      expect(() => new IterationGuard({ maxIterations: -1 })).toThrow(RangeError);
    });

    it("should reject maxExecutionTimeMs < 0", () => {
      expect(() => new IterationGuard({ maxExecutionTimeMs: -1 })).toThrow(RangeError);
    });

    it("should reject NaN maxIterations", () => {
      expect(() => new IterationGuard({ maxIterations: NaN })).toThrow(RangeError);
    });

    it("should reject Infinity maxIterations", () => {
      expect(() => new IterationGuard({ maxIterations: Infinity })).toThrow(RangeError);
    });

    it("should reject NaN maxExecutionTimeMs", () => {
      expect(() => new IterationGuard({ maxExecutionTimeMs: NaN })).toThrow(RangeError);
    });

    it("should accept maxExecutionTimeMs of 0 (immediate timeout)", () => {
      // 0 means "timeout immediately on first check" — degenerate but valid
      const guard = new IterationGuard({ maxExecutionTimeMs: 0 });
      expect(() => guard.check()).toThrow(ExecutionTimeoutError);
    });

    it("should accept custom limits", () => {
      const guard = new IterationGuard({
        maxIterations: 50,
        maxExecutionTimeMs: 300_000,
      });
      expect(guard.max).toBe(50);
    });
  });

  describe("DEFAULT_EXECUTION_LIMITS", () => {
    it("should have maxIterations of 25", () => {
      expect(DEFAULT_EXECUTION_LIMITS.maxIterations).toBe(25);
    });

    it("should have maxExecutionTimeMs of 120_000", () => {
      expect(DEFAULT_EXECUTION_LIMITS.maxExecutionTimeMs).toBe(120_000);
    });
  });
});
