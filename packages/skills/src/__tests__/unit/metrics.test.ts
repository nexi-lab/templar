import { describe, expect, it } from "vitest";
import {
  getSkillCacheAccess,
  getSkillLoadDuration,
  recordCacheAccess,
  recordLoadTime,
} from "../../metrics.js";

describe("Skill metrics", () => {
  describe("getSkillLoadDuration", () => {
    it("returns a histogram instrument", () => {
      const histogram = getSkillLoadDuration();
      expect(histogram).toBeDefined();
      expect(typeof histogram.record).toBe("function");
    });

    it("returns same instance on subsequent calls (lazy singleton)", () => {
      const a = getSkillLoadDuration();
      const b = getSkillLoadDuration();
      expect(a).toBe(b);
    });
  });

  describe("getSkillCacheAccess", () => {
    it("returns a counter instrument", () => {
      const counter = getSkillCacheAccess();
      expect(counter).toBeDefined();
      expect(typeof counter.add).toBe("function");
    });

    it("returns same instance on subsequent calls (lazy singleton)", () => {
      const a = getSkillCacheAccess();
      const b = getSkillCacheAccess();
      expect(a).toBe(b);
    });
  });

  describe("recordLoadTime", () => {
    it("does not throw without OTel provider (no-op)", () => {
      expect(() => recordLoadTime("metadata", "test-skill", 42)).not.toThrow();
      expect(() => recordLoadTime("content", "test-skill", 100)).not.toThrow();
      expect(() => recordLoadTime("resource", "test-skill", 5)).not.toThrow();
    });
  });

  describe("recordCacheAccess", () => {
    it("does not throw without OTel provider (no-op)", () => {
      expect(() => recordCacheAccess("metadata", true)).not.toThrow();
      expect(() => recordCacheAccess("content", false)).not.toThrow();
      expect(() => recordCacheAccess("resource", true)).not.toThrow();
    });
  });
});
