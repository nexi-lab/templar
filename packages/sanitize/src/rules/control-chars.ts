import type { SanitizationRule, SanitizeViolation } from "../types.js";
import { collectRegexViolations, truncateMatch } from "./utils.js";

/**
 * Control characters to strip (U+0000-U+001F excluding \t \n \r)
 * Uses a character class to avoid backtracking
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control chars for sanitization
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Zero-width and invisible formatting characters
 * U+200B Zero Width Space
 * U+200C Zero Width Non-Joiner
 * U+200D Zero Width Joiner
 * U+200E Left-to-Right Mark
 * U+200F Right-to-Left Mark
 * U+FEFF BOM / Zero Width No-Break Space
 * U+00AD Soft Hyphen
 */
const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\uFEFF\u00AD]/g;

/**
 * Bidirectional override characters (Trojan Source prevention)
 * U+202A-U+202E: LRE, RLE, PDF, LRO, RLO
 * U+2066-U+2069: LRI, RLI, FSI, PDI
 */
const BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069]/g;

const controlCharRule: SanitizationRule = {
  name: "control-chars",
  description: "Strip control characters (U+0000-U+001F except tab, LF, CR)",
  test(content: string): readonly SanitizeViolation[] {
    return collectRegexViolations(
      content,
      CONTROL_CHAR_PATTERN,
      this.name,
      "Control character detected",
      "medium",
    );
  },
  strip(content: string): string {
    return content.replace(CONTROL_CHAR_PATTERN, "");
  },
};

const zeroWidthRule: SanitizationRule = {
  name: "zero-width-chars",
  description: "Strip zero-width and invisible formatting characters",
  test(content: string): readonly SanitizeViolation[] {
    return collectRegexViolations(
      content,
      ZERO_WIDTH_PATTERN,
      this.name,
      "Zero-width or invisible character detected",
      "medium",
    );
  },
  strip(content: string): string {
    return content.replace(ZERO_WIDTH_PATTERN, "");
  },
};

const bidiRule: SanitizationRule = {
  name: "bidi-override",
  description: "Strip bidirectional override characters (Trojan Source prevention)",
  test(content: string): readonly SanitizeViolation[] {
    return collectRegexViolations(
      content,
      BIDI_PATTERN,
      this.name,
      "Bidirectional override character detected",
      "high",
    );
  },
  strip(content: string): string {
    return content.replace(BIDI_PATTERN, "");
  },
};

const nfcNormalizationRule: SanitizationRule = {
  name: "nfc-normalization",
  description: "Apply NFC normalization to standardize Unicode",
  test(content: string): readonly SanitizeViolation[] {
    const normalized = content.normalize("NFC");
    if (normalized !== content) {
      return [
        {
          rule: this.name,
          description: "Content required NFC normalization",
          severity: "low",
          matched: truncateMatch(content.slice(0, 50)),
          index: 0,
        },
      ];
    }
    return [];
  },
  strip(content: string): string {
    return content.normalize("NFC");
  },
};

export const CONTROL_CHAR_RULES: readonly SanitizationRule[] = [
  nfcNormalizationRule,
  controlCharRule,
  zeroWidthRule,
  bidiRule,
];
