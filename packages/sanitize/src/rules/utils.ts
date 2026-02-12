import { DEFAULT_MAX_MATCH_LENGTH } from "../constants.js";
import type { SanitizeViolation, ViolationSeverity } from "../types.js";

export function truncateMatch(matched: string): string {
  if (matched.length <= DEFAULT_MAX_MATCH_LENGTH) return matched;
  return `${matched.slice(0, DEFAULT_MAX_MATCH_LENGTH)}...`;
}

/**
 * Collect all regex matches from content as violations.
 * Uses a for-loop to avoid assignment-in-expression.
 */
export function collectRegexViolations(
  content: string,
  pattern: RegExp,
  ruleName: string,
  description: string,
  severity: ViolationSeverity,
): readonly SanitizeViolation[] {
  const violations: SanitizeViolation[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
    violations.push({
      rule: ruleName,
      description,
      severity,
      matched: truncateMatch(match[0]),
      index: match.index,
    });
  }
  return violations;
}
