import type { SanitizationRule, SanitizeViolation } from "../types.js";
import { truncateMatch } from "./utils.js";

/**
 * Detect LLM-specific prompt delimiter markers
 * Patterns: <system>, </system>, [INST], [/INST], <<SYS>>, <</SYS>>
 * All case-insensitive, using alternation (no backtracking risk)
 */
const PROMPT_DELIMITER_PATTERN = /<\/?system>|\[\/?(INST|inst)\]|<<\/?(SYS|sys)>>/gi;

/**
 * Detect instruction override attempts
 * "ignore previous instructions", "you are now", "disregard all", etc.
 * Anchored with word boundaries to avoid false positives
 */
const INSTRUCTION_OVERRIDE_PATTERN =
  /\b(?:ignore\s+(?:all\s+)?previous\s+instructions|you\s+are\s+now\b|disregard\s+(?:all\s+)?(?:previous\s+)?instructions|forget\s+(?:all\s+)?(?:previous\s+)?instructions|override\s+(?:system\s+)?prompt|new\s+system\s+prompt)\b/gi;

const promptDelimiterRule: SanitizationRule = {
  name: "prompt-delimiter",
  description: "Detect LLM prompt delimiter markers (<system>, [INST], <<SYS>>)",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    PROMPT_DELIMITER_PATTERN.lastIndex = 0;
    for (
      let match = PROMPT_DELIMITER_PATTERN.exec(content);
      match !== null;
      match = PROMPT_DELIMITER_PATTERN.exec(content)
    ) {
      violations.push({
        rule: this.name,
        description: `Prompt delimiter marker detected: ${match[0]}`,
        severity: "critical",
        matched: truncateMatch(match[0]),
        index: match.index,
      });
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(PROMPT_DELIMITER_PATTERN, "");
  },
};

const instructionOverrideRule: SanitizationRule = {
  name: "instruction-override",
  description: "Detect instruction override attempts (ignore previous instructions, etc.)",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    INSTRUCTION_OVERRIDE_PATTERN.lastIndex = 0;
    for (
      let match = INSTRUCTION_OVERRIDE_PATTERN.exec(content);
      match !== null;
      match = INSTRUCTION_OVERRIDE_PATTERN.exec(content)
    ) {
      violations.push({
        rule: this.name,
        description: `Instruction override attempt detected: ${match[0]}`,
        severity: "critical",
        matched: truncateMatch(match[0]),
        index: match.index,
      });
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(INSTRUCTION_OVERRIDE_PATTERN, "");
  },
};

/**
 * Detect Base64-encoded injection attempts
 * Look for Base64-encoded strings that decode to known prompt delimiters
 */
const BASE64_CHUNK_PATTERN = /[A-Za-z0-9+/]{8,}={0,2}/g;

/** Known prompt markers to check for in decoded Base64 */
const DECODED_MARKERS = /<\/?system>|\[\/?(INST|inst)\]|<<\/?(SYS|sys)>>/i;

function isValidBase64(str: string): boolean {
  return str.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}

function safeBase64Decode(str: string): string | null {
  try {
    if (!isValidBase64(str)) return null;
    return Buffer.from(str, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

const base64InjectionRule: SanitizationRule = {
  name: "base64-injection",
  description: "Detect Base64-encoded prompt injection attempts",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    BASE64_CHUNK_PATTERN.lastIndex = 0;
    for (
      let match = BASE64_CHUNK_PATTERN.exec(content);
      match !== null;
      match = BASE64_CHUNK_PATTERN.exec(content)
    ) {
      const decoded = safeBase64Decode(match[0]);
      if (decoded !== null && DECODED_MARKERS.test(decoded)) {
        violations.push({
          rule: this.name,
          description: "Base64-encoded prompt injection detected",
          severity: "critical",
          matched: truncateMatch(match[0]),
          index: match.index,
        });
      }
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(BASE64_CHUNK_PATTERN, (match) => {
      const decoded = safeBase64Decode(match);
      if (decoded !== null && DECODED_MARKERS.test(decoded)) {
        return "";
      }
      return match;
    });
  },
};

export const PROMPT_INJECTION_RULES: readonly SanitizationRule[] = [
  promptDelimiterRule,
  instructionOverrideRule,
  base64InjectionRule,
];
