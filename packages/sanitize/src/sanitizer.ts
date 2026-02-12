import {
  SanitizeConfigurationError,
  SanitizeContentBlockedError,
  SanitizeRuleFailedError,
} from "@templar/errors";
import { DEFAULT_MAX_INPUT_LENGTH } from "./constants.js";
import { DEFAULT_RULES } from "./rules/index.js";
import type {
  ContentSanitizerConfig,
  SanitizationRule,
  SanitizeResult,
  SanitizeViolation,
} from "./types.js";

export class ContentSanitizer {
  private readonly rules: readonly SanitizationRule[];
  private readonly maxInputLength: number;

  constructor(config?: ContentSanitizerConfig) {
    this.rules = config?.rules ?? DEFAULT_RULES;
    this.maxInputLength = config?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;

    const issues: string[] = [];
    if (this.maxInputLength <= 0) {
      issues.push(`maxInputLength must be positive, got ${this.maxInputLength}`);
    }
    if (this.rules.length === 0) {
      issues.push("rules array must not be empty");
    }
    for (const rule of this.rules) {
      if (!rule.name) {
        issues.push("each rule must have a non-empty name");
      }
    }
    if (issues.length > 0) {
      throw new SanitizeConfigurationError(
        `Invalid sanitizer configuration: ${issues.join("; ")}`,
        issues,
      );
    }
  }

  sanitize(content: string): SanitizeResult {
    if (content.length > this.maxInputLength) {
      throw new SanitizeContentBlockedError(
        "Content exceeds maximum input length",
        content.length,
        this.maxInputLength,
      );
    }

    const original = content;
    let current = content;
    let allViolations: readonly SanitizeViolation[] = [];

    for (const rule of this.rules) {
      try {
        const violations = rule.test(current);
        if (violations.length > 0) {
          allViolations = [...allViolations, ...violations];
        }
        current = rule.strip(current);
      } catch (error) {
        if (error instanceof SanitizeRuleFailedError) throw error;
        throw new SanitizeRuleFailedError(
          rule.name,
          error instanceof Error ? error.message : String(error),
          undefined,
          undefined,
          error instanceof Error ? error : undefined,
        );
      }
    }

    return {
      original,
      clean: current,
      violations: allViolations,
      safe: allViolations.length === 0,
    };
  }
}
