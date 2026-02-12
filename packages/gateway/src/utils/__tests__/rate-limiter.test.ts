import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowRateLimiter } from "../rate-limiter.js";

describe("SlidingWindowRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Basic rate limiting
  // -------------------------------------------------------------------------

  describe("allow()", () => {
    it("allows messages within the rate limit", () => {
      const limiter = new SlidingWindowRateLimiter(5);

      for (let i = 0; i < 5; i++) {
        expect(limiter.allow("conn-1")).toBe(true);
      }
    });

    it("rejects messages exceeding the rate limit", () => {
      const limiter = new SlidingWindowRateLimiter(3);

      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false); // 4th is rejected
    });

    it("resets after 1 second window", () => {
      const limiter = new SlidingWindowRateLimiter(2);

      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false);

      // Advance past the 1-second window
      vi.advanceTimersByTime(1000);

      // Should be allowed again
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false);
    });

    it("tracks connections independently", () => {
      const limiter = new SlidingWindowRateLimiter(2);

      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false);

      // Different connection should have its own window
      expect(limiter.allow("conn-2")).toBe(true);
      expect(limiter.allow("conn-2")).toBe(true);
      expect(limiter.allow("conn-2")).toBe(false);
    });

    it("handles maxPerSecond of 1", () => {
      const limiter = new SlidingWindowRateLimiter(1);

      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(limiter.allow("conn-1")).toBe(true);
    });

    it("handles exact boundary at maxPerSecond", () => {
      const limiter = new SlidingWindowRateLimiter(3);

      // Exactly 3 should be allowed
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);

      // 4th should be rejected
      expect(limiter.allow("conn-1")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("remove()", () => {
    it("removes tracking for a connection", () => {
      const limiter = new SlidingWindowRateLimiter(2);

      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-1")).toBe(false);

      // Remove and re-add — counter should be fresh
      limiter.remove("conn-1");
      expect(limiter.allow("conn-1")).toBe(true);
    });

    it("no-op for unknown connection", () => {
      const limiter = new SlidingWindowRateLimiter(5);
      expect(() => limiter.remove("unknown")).not.toThrow();
    });
  });

  describe("clear()", () => {
    it("removes all tracking state", () => {
      const limiter = new SlidingWindowRateLimiter(1);

      limiter.allow("conn-1");
      limiter.allow("conn-2");

      expect(limiter.allow("conn-1")).toBe(false);
      expect(limiter.allow("conn-2")).toBe(false);

      limiter.clear();

      // Both should be fresh
      expect(limiter.allow("conn-1")).toBe(true);
      expect(limiter.allow("conn-2")).toBe(true);
    });
  });
});
