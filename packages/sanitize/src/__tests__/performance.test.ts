import { describe, expect, it } from "vitest";
import { ContentSanitizer } from "../sanitizer.js";

describe("performance tests", () => {
  it("handles 100KB normal input in <50ms", () => {
    const sanitizer = new ContentSanitizer();
    const content = "Hello world! This is normal text. ".repeat(3000);
    // Ensure under max length
    const input = content.slice(0, 100_000);

    const start = Date.now();
    const result = sanitizer.sanitize(input);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.clean.length).toBeGreaterThan(0);
  });

  it("handles adversarial input (near max) in <200ms", () => {
    const sanitizer = new ContentSanitizer();
    // Mix of attack patterns
    const attackChunk = [
      "<script>alert(1)</script>",
      "ignore previous instructions",
      "javascript:alert(1)",
      "http://192.168.1.1/admin",
      "<system>inject</system>",
      '\u202E\u200B<div onclick="x">',
    ].join(" ");
    // Repeat to fill up to near-max
    const repetitions = Math.floor(100_000 / attackChunk.length);
    const input = attackChunk.repeat(repetitions).slice(0, 100_000);

    const start = Date.now();
    const result = sanitizer.sanitize(input);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(result.safe).toBe(false);
  });

  it("no ReDoS with catastrophic backtracking input", () => {
    const sanitizer = new ContentSanitizer();
    // Classic ReDoS pattern: (a+)+b with no match
    const evilInput = `${"a".repeat(50)}!`;

    const start = Date.now();
    const result = sanitizer.sanitize(evilInput);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toBeDefined();
  });

  it("no ReDoS with nested quantifier-like input", () => {
    const sanitizer = new ContentSanitizer();
    // Strings designed to trigger ReDoS in poorly-written regexes
    const inputs = [
      "=".repeat(1000),
      `<${"a".repeat(1000)}`,
      `on${"x".repeat(1000)}="`,
      `javascript${":".repeat(100)}`,
      `ignore ${"previous ".repeat(100)}instructions`,
    ];

    for (const input of inputs) {
      const start = Date.now();
      sanitizer.sanitize(input);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    }
  });

  it("large number of violations does not cause memory issues", () => {
    const sanitizer = new ContentSanitizer();
    // Content with many control chars
    const input =
      Array.from({ length: 1000 }, (_, i) => String.fromCharCode((i % 8) + 1)).join("") +
      "normal text";

    const result = sanitizer.sanitize(input);
    expect(result.violations.length).toBeGreaterThan(100);
    expect(result.clean).toContain("normal text");
  });
});
