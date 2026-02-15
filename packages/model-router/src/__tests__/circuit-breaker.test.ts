import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts in closed state", () => {
      const cb = new CircuitBreaker();
      expect(cb.getState("openai")).toBe("closed");
    });

    it("allows execution in closed state", () => {
      const cb = new CircuitBreaker();
      expect(cb.canExecute("openai")).toBe(true);
    });
  });

  describe("closed → open transition", () => {
    it("trips to open after reaching failure threshold", () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure("openai");
      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("closed");

      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");
    });

    it("does not trip if failures are outside the window", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 10_000,
      });

      cb.recordFailure("openai");
      cb.recordFailure("openai");

      // Advance past the window
      vi.advanceTimersByTime(11_000);

      cb.recordFailure("openai");
      // Only 1 failure within the window
      expect(cb.getState("openai")).toBe("closed");
    });

    it("rejects execution when open", () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure("openai");
      expect(cb.canExecute("openai")).toBe(false);
    });
  });

  describe("open → half-open transition", () => {
    it("transitions to half-open after reset timeout", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5_000,
      });
      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");

      vi.advanceTimersByTime(5_000);
      expect(cb.getState("openai")).toBe("half-open");
    });

    it("allows one probe request in half-open", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5_000,
        halfOpenMaxAttempts: 1,
      });
      cb.recordFailure("openai");
      vi.advanceTimersByTime(5_000);

      expect(cb.canExecute("openai")).toBe(true);
    });
  });

  describe("half-open → closed on success", () => {
    it("transitions to closed on successful probe", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5_000,
      });
      cb.recordFailure("openai");
      vi.advanceTimersByTime(5_000);

      cb.recordSuccess("openai");
      expect(cb.getState("openai")).toBe("closed");
      expect(cb.canExecute("openai")).toBe(true);
    });
  });

  describe("half-open → open on failure", () => {
    it("transitions back to open on probe failure", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5_000,
        halfOpenMaxAttempts: 1,
      });
      cb.recordFailure("openai");
      vi.advanceTimersByTime(5_000);

      // Now in half-open; a failure should re-open
      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");
    });
  });

  describe("per-provider isolation", () => {
    it("tracks state independently per provider", () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });

      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");
      expect(cb.getState("anthropic")).toBe("closed");
      expect(cb.canExecute("anthropic")).toBe(true);
    });
  });

  describe("success resets failure count", () => {
    it("resets failures on success in closed state", () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure("openai");
      cb.recordFailure("openai");
      cb.recordSuccess("openai");

      // After success, need 3 more failures to trip
      cb.recordFailure("openai");
      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("closed");

      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");
    });
  });

  describe("concurrent probes in half-open", () => {
    it("limits the number of half-open probes", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5_000,
        halfOpenMaxAttempts: 2,
      });

      cb.recordFailure("openai");
      vi.advanceTimersByTime(5_000);

      // Should allow 2 probes
      expect(cb.canExecute("openai")).toBe(true);
      // Simulate that a probe is in flight but hasn't resolved yet
      // The next call checks halfOpenAttempts < max
      expect(cb.canExecute("openai")).toBe(true);
    });
  });

  describe("custom configuration", () => {
    it("uses custom failure threshold", () => {
      const cb = new CircuitBreaker({ failureThreshold: 10 });

      for (let i = 0; i < 9; i++) {
        cb.recordFailure("openai");
      }
      expect(cb.getState("openai")).toBe("closed");

      cb.recordFailure("openai");
      expect(cb.getState("openai")).toBe("open");
    });
  });
});
