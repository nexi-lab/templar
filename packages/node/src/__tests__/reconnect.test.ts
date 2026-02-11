import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectStrategy } from "../reconnect.js";
import { DEFAULT_RECONNECT_CONFIG } from "../types.js";

describe("ReconnectStrategy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("nextDelay", () => {
    it("should return a delay within the expected range for attempt 0", () => {
      const strategy = new ReconnectStrategy(DEFAULT_RECONNECT_CONFIG);
      // Full jitter: random * min(maxDelay, baseDelay * 2^0) = random * 1000
      const delay = strategy.nextDelay();
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1_000);
    });

    it("should increase exponentially across attempts", () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 10,
        baseDelay: 100,
        maxDelay: 100_000,
      });

      // Collect max possible delays for each attempt
      // attempt 0: max 100, attempt 1: max 200, attempt 2: max 400, attempt 3: max 800
      const delay0 = strategy.nextDelay(); // uses attempt 0, increments to 1
      const delay1 = strategy.nextDelay(); // uses attempt 1, increments to 2
      const delay2 = strategy.nextDelay(); // uses attempt 2, increments to 3

      // Due to jitter, individual delays may not be strictly increasing,
      // but the upper bound doubles each time. We can't test exact values
      // due to randomness. Instead verify they're within bounds.
      expect(delay0).toBeLessThanOrEqual(100);
      expect(delay1).toBeLessThanOrEqual(200);
      expect(delay2).toBeLessThanOrEqual(400);
    });

    it("should never exceed maxDelay", () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 20,
        baseDelay: 1_000,
        maxDelay: 5_000,
      });

      // Advance to high attempt numbers
      for (let i = 0; i < 15; i++) {
        const delay = strategy.nextDelay();
        expect(delay).toBeLessThanOrEqual(5_000);
      }
    });
  });

  describe("attempt tracking", () => {
    it("should start at attempt 0", () => {
      const strategy = new ReconnectStrategy(DEFAULT_RECONNECT_CONFIG);
      expect(strategy.attempt).toBe(0);
    });

    it("should increment attempt on nextDelay", () => {
      const strategy = new ReconnectStrategy(DEFAULT_RECONNECT_CONFIG);
      strategy.nextDelay();
      expect(strategy.attempt).toBe(1);
      strategy.nextDelay();
      expect(strategy.attempt).toBe(2);
    });

    it("should reset attempt to 0", () => {
      const strategy = new ReconnectStrategy(DEFAULT_RECONNECT_CONFIG);
      strategy.nextDelay();
      strategy.nextDelay();
      expect(strategy.attempt).toBe(2);

      strategy.reset();
      expect(strategy.attempt).toBe(0);
    });
  });

  describe("exhausted", () => {
    it("should not be exhausted initially", () => {
      const strategy = new ReconnectStrategy(DEFAULT_RECONNECT_CONFIG);
      expect(strategy.exhausted).toBe(false);
    });

    it("should be exhausted after maxRetries attempts", () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1_000,
      });

      strategy.nextDelay(); // attempt 0 → 1
      strategy.nextDelay(); // attempt 1 → 2
      strategy.nextDelay(); // attempt 2 → 3
      expect(strategy.exhausted).toBe(true);
    });

    it("should not be exhausted before maxRetries", () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1_000,
      });

      strategy.nextDelay(); // attempt 0 → 1
      strategy.nextDelay(); // attempt 1 → 2
      expect(strategy.exhausted).toBe(false);
    });

    it("should reset exhausted state after reset", () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 1,
        baseDelay: 100,
        maxDelay: 1_000,
      });

      strategy.nextDelay(); // attempt 0 → 1
      expect(strategy.exhausted).toBe(true);

      strategy.reset();
      expect(strategy.exhausted).toBe(false);
    });
  });

  describe("schedule", () => {
    it("should fire callback after the delay", async () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 10,
        baseDelay: 1_000,
        maxDelay: 30_000,
      });
      const fn = vi.fn().mockResolvedValue(undefined);

      strategy.schedule(fn);

      expect(fn).not.toHaveBeenCalled();

      // Advance past max possible delay for attempt 0
      await vi.advanceTimersByTimeAsync(1_000);

      expect(fn).toHaveBeenCalledOnce();
    });

    it("should return a cancel function that prevents callback", async () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 10,
        baseDelay: 1_000,
        maxDelay: 30_000,
      });
      const fn = vi.fn().mockResolvedValue(undefined);

      const { cancel } = strategy.schedule(fn);
      cancel();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(fn).not.toHaveBeenCalled();
    });

    it("should cancel previous schedule when scheduling again", async () => {
      const strategy = new ReconnectStrategy({
        maxRetries: 10,
        baseDelay: 1_000,
        maxDelay: 30_000,
      });
      const fn1 = vi.fn().mockResolvedValue(undefined);
      const fn2 = vi.fn().mockResolvedValue(undefined);

      strategy.schedule(fn1);
      strategy.schedule(fn2); // should cancel fn1

      await vi.advanceTimersByTimeAsync(30_000);

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledOnce();
    });
  });
});
