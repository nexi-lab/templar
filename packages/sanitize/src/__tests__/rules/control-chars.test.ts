import { describe, expect, it } from "vitest";
import { CONTROL_CHAR_RULES } from "../../rules/control-chars.js";
import type { SanitizationRule } from "../../types.js";

const [nfcNormalizationRule, controlCharRule, zeroWidthRule, bidiRule] = [
  ...CONTROL_CHAR_RULES,
] as [SanitizationRule, SanitizationRule, SanitizationRule, SanitizationRule];

describe("nfc-normalization rule", () => {
  it("detects content needing NFC normalization", () => {
    // NFD: e + combining accent (two code points)
    const nfd = "e\u0301"; // é as NFD
    const violations = nfcNormalizationRule.test(nfd);
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("low");
  });

  it("does not flag already-NFC content", () => {
    const nfc = "\u00E9"; // é as NFC (single code point)
    const violations = nfcNormalizationRule.test(nfc);
    expect(violations.length).toBe(0);
  });

  it("normalizes content to NFC", () => {
    const nfd = "e\u0301";
    const result = nfcNormalizationRule.strip(nfd);
    expect(result).toBe("\u00E9");
  });

  it("leaves ASCII text unchanged", () => {
    const result = nfcNormalizationRule.strip("Hello world");
    expect(result).toBe("Hello world");
  });
});

describe("control-chars rule", () => {
  it("detects null bytes", () => {
    const violations = controlCharRule.test("hello\x00world");
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("medium");
  });

  it("detects other control characters", () => {
    const violations = controlCharRule.test("a\x01b\x02c\x03d");
    expect(violations.length).toBe(3);
  });

  it("strips null bytes", () => {
    const result = controlCharRule.strip("hel\x00lo");
    expect(result).toBe("hello");
  });

  it("strips control chars U+0001-U+0008", () => {
    const result = controlCharRule.strip("a\x01\x02\x03\x04\x05\x06\x07\x08b");
    expect(result).toBe("ab");
  });

  it("preserves tab (\\t)", () => {
    const result = controlCharRule.strip("hello\tworld");
    expect(result).toBe("hello\tworld");
  });

  it("preserves newline (\\n)", () => {
    const result = controlCharRule.strip("hello\nworld");
    expect(result).toBe("hello\nworld");
  });

  it("preserves carriage return (\\r)", () => {
    const result = controlCharRule.strip("hello\rworld");
    expect(result).toBe("hello\rworld");
  });

  it("strips DEL character U+007F", () => {
    const result = controlCharRule.strip("hello\x7Fworld");
    expect(result).toBe("helloworld");
  });
});

describe("zero-width-chars rule", () => {
  it("detects zero-width space U+200B", () => {
    const violations = zeroWidthRule.test("hello\u200Bworld");
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("medium");
  });

  it("detects BOM U+FEFF", () => {
    const violations = zeroWidthRule.test("\uFEFFcontent");
    expect(violations.length).toBe(1);
  });

  it("detects soft hyphen U+00AD", () => {
    const violations = zeroWidthRule.test("in\u00ADvisible");
    expect(violations.length).toBe(1);
  });

  it("strips all zero-width characters", () => {
    const result = zeroWidthRule.strip("he\u200Bll\u200Co\u200D \u200Ewo\u200Frld\uFEFF");
    expect(result).toBe("hello world");
  });

  it("does not flag normal whitespace", () => {
    const violations = zeroWidthRule.test("hello world\n\t");
    expect(violations.length).toBe(0);
  });
});

describe("bidi-override rule", () => {
  it("detects LRO (U+202D) - Trojan Source prevention", () => {
    const violations = bidiRule.test("access\u202D check");
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("high");
  });

  it("detects RLO (U+202E)", () => {
    const violations = bidiRule.test("text\u202Ehidden");
    expect(violations.length).toBe(1);
  });

  it("detects LRI (U+2066)", () => {
    const violations = bidiRule.test("a\u2066b");
    expect(violations.length).toBe(1);
  });

  it("strips all bidi override characters", () => {
    const result = bidiRule.strip("a\u202Ab\u202Bc\u202Cd\u202De\u202Ef");
    expect(result).toBe("abcdef");
  });

  it("strips isolate characters U+2066-U+2069", () => {
    const result = bidiRule.strip("a\u2066b\u2067c\u2068d\u2069e");
    expect(result).toBe("abcde");
  });

  it("does not flag normal text", () => {
    const violations = bidiRule.test("Hello world! 123");
    expect(violations.length).toBe(0);
  });
});
