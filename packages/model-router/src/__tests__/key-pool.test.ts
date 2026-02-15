import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyPool } from "../key-pool.js";

describe("KeyPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("selectKey", () => {
    it("returns the first key for a provider", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
      });
      const key = pool.selectKey("openai");
      expect(key).toEqual({ key: "sk-1" });
    });

    it("round-robins among available keys", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }, { key: "sk-3" }] },
      });
      expect(pool.selectKey("openai")?.key).toBe("sk-1");
      expect(pool.selectKey("openai")?.key).toBe("sk-2");
      expect(pool.selectKey("openai")?.key).toBe("sk-3");
      expect(pool.selectKey("openai")?.key).toBe("sk-1");
    });

    it("respects priority ordering (lower priority number = higher priority)", () => {
      const pool = new KeyPool({
        openai: {
          keys: [
            { key: "sk-low", priority: 10 },
            { key: "sk-high", priority: 1 },
          ],
        },
      });
      expect(pool.selectKey("openai")?.key).toBe("sk-high");
    });

    it("skips keys in cooldown", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.selectKey("openai")?.key).toBe("sk-2");
    });

    it("returns undefined when all keys are in cooldown", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.selectKey("openai")).toBeUndefined();
    });

    it("returns undefined for unknown provider", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      expect(pool.selectKey("unknown")).toBeUndefined();
    });
  });

  describe("markCooldown", () => {
    it("puts a key in cooldown for configured duration", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }], cooldownMs: 5_000 },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(false);

      vi.advanceTimersByTime(4_999);
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(false);

      vi.advanceTimersByTime(1);
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(true);
    });

    it("uses default cooldown of 5 minutes when not configured", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(false);

      vi.advanceTimersByTime(300_000);
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(true);
    });

    it("does nothing for unknown provider", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      pool.markCooldown("unknown", "sk-1"); // should not throw
    });
  });

  describe("isKeyAvailable", () => {
    it("returns true for keys not in cooldown", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      expect(pool.isKeyAvailable("openai", "sk-1")).toBe(true);
    });

    it("returns false for unknown provider", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }] },
      });
      expect(pool.isKeyAvailable("unknown", "sk-1")).toBe(false);
    });
  });

  describe("hasAvailableKeys", () => {
    it("returns true when keys are available", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
      });
      expect(pool.hasAvailableKeys("openai")).toBe(true);
    });

    it("returns true when some keys are in cooldown", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.hasAvailableKeys("openai")).toBe(true);
    });

    it("returns false when all keys are in cooldown", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
      });
      pool.markCooldown("openai", "sk-1");
      pool.markCooldown("openai", "sk-2");
      expect(pool.hasAvailableKeys("openai")).toBe(false);
    });

    it("returns false for unknown provider", () => {
      const pool = new KeyPool({});
      expect(pool.hasAvailableKeys("unknown")).toBe(false);
    });
  });

  describe("totalKeys / availableKeys", () => {
    it("reports correct counts", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }, { key: "sk-3" }] },
      });
      expect(pool.totalKeys("openai")).toBe(3);
      expect(pool.availableKeys("openai")).toBe(3);

      pool.markCooldown("openai", "sk-1");
      expect(pool.availableKeys("openai")).toBe(2);
    });

    it("returns 0 for unknown provider", () => {
      const pool = new KeyPool({});
      expect(pool.totalKeys("unknown")).toBe(0);
      expect(pool.availableKeys("unknown")).toBe(0);
    });
  });

  describe("lazy cleanup", () => {
    it("prunes expired cooldowns when selecting keys", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }], cooldownMs: 1_000 },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.selectKey("openai")).toBeUndefined();

      vi.advanceTimersByTime(1_000);
      expect(pool.selectKey("openai")?.key).toBe("sk-1");
    });

    it("prunes expired cooldowns when checking availability", () => {
      const pool = new KeyPool({
        openai: { keys: [{ key: "sk-1" }], cooldownMs: 1_000 },
      });
      pool.markCooldown("openai", "sk-1");
      expect(pool.hasAvailableKeys("openai")).toBe(false);

      vi.advanceTimersByTime(1_000);
      expect(pool.hasAvailableKeys("openai")).toBe(true);
    });
  });
});
