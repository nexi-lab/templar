import {
  SanitizeConfigurationError,
  SanitizeContentBlockedError,
  SanitizeRuleFailedError,
} from "@templar/errors";
import { describe, expect, it } from "vitest";
import { ContentSanitizer } from "../sanitizer.js";
import type { SanitizationRule } from "../types.js";

const safeRule: SanitizationRule = {
  name: "test-safe",
  description: "A rule that finds nothing",
  test: () => [],
  strip: (c: string) => c,
};

const detectRule: SanitizationRule = {
  name: "test-detect",
  description: "A rule that detects 'BAD'",
  test(content: string) {
    const violations = [];
    let idx = content.indexOf("BAD");
    while (idx !== -1) {
      violations.push({
        rule: this.name,
        description: "Found BAD",
        severity: "high" as const,
        matched: "BAD",
        index: idx,
      });
      idx = content.indexOf("BAD", idx + 1);
    }
    return violations;
  },
  strip(content: string) {
    return content.replaceAll("BAD", "");
  },
};

const throwingRule: SanitizationRule = {
  name: "test-throwing",
  description: "A rule that always throws",
  test() {
    throw new Error("rule exploded");
  },
  strip() {
    throw new Error("rule exploded");
  },
};

describe("ContentSanitizer", () => {
  describe("constructor validation", () => {
    it("creates with default config", () => {
      const sanitizer = new ContentSanitizer();
      expect(sanitizer).toBeInstanceOf(ContentSanitizer);
    });

    it("creates with custom rules", () => {
      const sanitizer = new ContentSanitizer({ rules: [safeRule] });
      expect(sanitizer).toBeInstanceOf(ContentSanitizer);
    });

    it("throws SanitizeConfigurationError for empty rules", () => {
      expect(() => new ContentSanitizer({ rules: [] })).toThrow(SanitizeConfigurationError);
    });

    it("throws SanitizeConfigurationError for maxInputLength <= 0", () => {
      expect(() => new ContentSanitizer({ rules: [safeRule], maxInputLength: 0 })).toThrow(
        SanitizeConfigurationError,
      );
    });

    it("throws SanitizeConfigurationError for negative maxInputLength", () => {
      expect(() => new ContentSanitizer({ rules: [safeRule], maxInputLength: -1 })).toThrow(
        SanitizeConfigurationError,
      );
    });

    it("throws SanitizeConfigurationError for rule with empty name", () => {
      const badRule = { ...safeRule, name: "" };
      expect(() => new ContentSanitizer({ rules: [badRule] })).toThrow(SanitizeConfigurationError);
    });

    it("includes issues in the error", () => {
      try {
        new ContentSanitizer({ rules: [], maxInputLength: -1 });
      } catch (e) {
        expect(e).toBeInstanceOf(SanitizeConfigurationError);
        const err = e as SanitizeConfigurationError;
        expect(err.issues).toBeDefined();
        expect(err.issues?.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("maxInputLength enforcement", () => {
    it("throws SanitizeContentBlockedError for oversized input", () => {
      const sanitizer = new ContentSanitizer({
        rules: [safeRule],
        maxInputLength: 10,
      });
      expect(() => sanitizer.sanitize("a".repeat(11))).toThrow(SanitizeContentBlockedError);
    });

    it("allows input at exactly maxInputLength", () => {
      const sanitizer = new ContentSanitizer({
        rules: [safeRule],
        maxInputLength: 10,
      });
      const result = sanitizer.sanitize("a".repeat(10));
      expect(result.safe).toBe(true);
    });

    it("includes contentLength and maxLength in error", () => {
      const sanitizer = new ContentSanitizer({
        rules: [safeRule],
        maxInputLength: 5,
      });
      try {
        sanitizer.sanitize("toolong");
      } catch (e) {
        expect(e).toBeInstanceOf(SanitizeContentBlockedError);
        const err = e as SanitizeContentBlockedError;
        expect(err.contentLength).toBe(7);
        expect(err.maxLength).toBe(5);
      }
    });
  });

  describe("rule composition", () => {
    it("accumulates violations across rules", () => {
      const rule2: SanitizationRule = {
        name: "test-detect2",
        description: "Detects EVIL",
        test(content) {
          const idx = content.indexOf("EVIL");
          if (idx !== -1)
            return [
              {
                rule: this.name,
                description: "Found EVIL",
                severity: "critical",
                matched: "EVIL",
                index: idx,
              },
            ];
          return [];
        },
        strip: (c) => c.replaceAll("EVIL", ""),
      };

      const sanitizer = new ContentSanitizer({
        rules: [detectRule, rule2],
      });
      const result = sanitizer.sanitize("BAD and EVIL");
      expect(result.violations.length).toBe(2);
      expect(result.safe).toBe(false);
    });

    it("executes rules in order: first rule strips before second tests", () => {
      // detectRule strips "BAD", secondRule looks for "BAD" — should not find it
      const secondRule: SanitizationRule = {
        name: "second",
        description: "Also detects BAD",
        test(content) {
          if (content.includes("BAD"))
            return [
              {
                rule: this.name,
                description: "BAD found",
                severity: "high",
                matched: "BAD",
                index: content.indexOf("BAD"),
              },
            ];
          return [];
        },
        strip: (c) => c.replaceAll("BAD", ""),
      };

      const sanitizer = new ContentSanitizer({
        rules: [detectRule, secondRule],
      });
      const result = sanitizer.sanitize("This is BAD content");
      // detectRule found "BAD", secondRule should not (already stripped)
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]?.rule).toBe("test-detect");
    });
  });

  describe("clean input handling", () => {
    it("returns safe result for empty string", () => {
      const sanitizer = new ContentSanitizer({ rules: [safeRule] });
      const result = sanitizer.sanitize("");
      expect(result.safe).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.clean).toBe("");
      expect(result.original).toBe("");
    });

    it("returns safe result for clean input", () => {
      const sanitizer = new ContentSanitizer({ rules: [detectRule] });
      const result = sanitizer.sanitize("This is clean content");
      expect(result.safe).toBe(true);
      expect(result.clean).toBe("This is clean content");
    });
  });

  describe("result immutability", () => {
    it("preserves original in result", () => {
      const sanitizer = new ContentSanitizer({ rules: [detectRule] });
      const result = sanitizer.sanitize("This is BAD");
      expect(result.original).toBe("This is BAD");
      expect(result.clean).toBe("This is ");
    });

    it("violations array is readonly", () => {
      const sanitizer = new ContentSanitizer({ rules: [detectRule] });
      const result = sanitizer.sanitize("BAD text");
      // TypeScript readonly — runtime check that it's an array
      expect(Array.isArray(result.violations)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("wraps unexpected rule errors in SanitizeRuleFailedError", () => {
      const sanitizer = new ContentSanitizer({ rules: [throwingRule] });
      expect(() => sanitizer.sanitize("anything")).toThrow(SanitizeRuleFailedError);
    });

    it("includes rule name in wrapped error", () => {
      const sanitizer = new ContentSanitizer({ rules: [throwingRule] });
      try {
        sanitizer.sanitize("anything");
      } catch (e) {
        expect(e).toBeInstanceOf(SanitizeRuleFailedError);
        const err = e as SanitizeRuleFailedError;
        expect(err.ruleName).toBe("test-throwing");
      }
    });

    it("preserves original error as cause", () => {
      const sanitizer = new ContentSanitizer({ rules: [throwingRule] });
      try {
        sanitizer.sanitize("anything");
      } catch (e) {
        expect(e).toBeInstanceOf(SanitizeRuleFailedError);
        const err = e as SanitizeRuleFailedError;
        expect(err.cause).toBeInstanceOf(Error);
        expect(err.cause?.message).toBe("rule exploded");
      }
    });
  });
});
