/** Severity levels for sanitization violations */
export type ViolationSeverity = "low" | "medium" | "high" | "critical";

/** A single violation found during sanitization */
export interface SanitizeViolation {
  readonly rule: string;
  readonly description: string;
  readonly severity: ViolationSeverity;
  readonly matched: string;
  readonly index: number;
}

/** Result of sanitizing content — immutable */
export interface SanitizeResult {
  readonly original: string;
  readonly clean: string;
  readonly violations: readonly SanitizeViolation[];
  readonly safe: boolean;
}

/** A single sanitization rule */
export interface SanitizationRule {
  readonly name: string;
  readonly description: string;
  /** Test content and return violations (does NOT modify content) */
  test(content: string): readonly SanitizeViolation[];
  /** Strip/clean the content, returning the sanitized version */
  strip(content: string): string;
}

/** Configuration for ContentSanitizer */
export interface ContentSanitizerConfig {
  readonly rules?: readonly SanitizationRule[];
  readonly maxInputLength?: number;
}

/** Options per sanitize() call */
export interface SanitizeOptions {
  readonly allowedHtmlTags?: readonly string[];
}
