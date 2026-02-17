/**
 * Declarative manifest governance — rejects non-declarative constructs.
 *
 * Enforces TEMPLAR.md Section 16: templar.yaml is a declarative manifest
 * with no conditionals, loops, template expressions, or inline code.
 *
 * Two-layer validation:
 * 1. String scanner — catches template syntax before YAML parsing
 * 2. AST walker — catches semantic keys and code-injection values after parsing
 */

import { parse as parseYaml } from "yaml";

// =============================================================================
// Shared constants
// =============================================================================

/**
 * Valid env var name pattern: UPPER_SNAKE_CASE starting with a letter.
 * Used by both governance (allowlist) and interpolation (documentation).
 *
 * Examples:  API_KEY, DB_HOST, MY_VAR_123
 * Rejected: lowercase, MY-VAR (hyphen), complex.path, fn()
 */
export const VALID_ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

// =============================================================================
// Types
// =============================================================================

export interface GovernanceViolation {
  readonly rule: string;
  readonly line?: number;
  readonly snippet: string;
}

// =============================================================================
// String scanner — template syntax detection
// =============================================================================

/** Patterns that are unambiguously template-engine constructs */
const TEMPLATE_PATTERNS: ReadonlyArray<{ readonly regex: RegExp; readonly label: string }> = [
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional — these are governance pattern labels, not template strings
  { regex: /\$\{\{[^}]*\}\}/g, label: "${{ expression }}" },
  { regex: /\{\{[^}]*\}\}/g, label: "{{ expression }}" },
  { regex: /\{%[^%]*%\}/g, label: "{% block %}" },
];

/** Matches all ${...} tokens (single-brace) for env var validation */
const ALL_INTERPOLATIONS = /\$\{([^}]+)\}/g;

/** Valid interpolation: ${UPPER_SNAKE} or ${UPPER_SNAKE:default} */
const VALID_INTERPOLATION = /^[A-Z][A-Z0-9_]*(?::[^}]*)?$/;

/**
 * Scans raw YAML text for template-engine syntax and invalid interpolation patterns.
 *
 * Catches:
 * - `${{ expression }}` (GitHub Actions)
 * - `{{ variable }}` / `{{ .Value }}` (Jinja2/Go)
 * - `{% block %}` (Jinja2)
 * - `${lowercase}`, `${complex.path}`, `${fn()}` (invalid interpolation)
 *
 * Allows:
 * - `${UPPER_CASE}` and `${UPPER_CASE:default}` (Templar env var interpolation)
 */
export function scanRawGovernanceViolations(raw: string): GovernanceViolation[] {
  if (raw.length === 0) return [];

  const violations: GovernanceViolation[] = [];
  const lines = raw.split("\n");

  // Pass 1: Template-engine patterns
  for (const { regex, label } of TEMPLATE_PATTERNS) {
    // Reset lastIndex for each invocation
    regex.lastIndex = 0;
    for (let match = regex.exec(raw); match !== null; match = regex.exec(raw)) {
      const line = lineNumberAt(match.index, lines);
      violations.push({
        rule: "no-template-expression",
        line,
        snippet: `${label}: ${truncateSnippet(match[0])}`,
      });
    }
  }

  // Pass 2: Invalid ${...} interpolation (two-step find-then-filter)
  ALL_INTERPOLATIONS.lastIndex = 0;
  for (
    let interpMatch = ALL_INTERPOLATIONS.exec(raw);
    interpMatch !== null;
    interpMatch = ALL_INTERPOLATIONS.exec(raw)
  ) {
    const content = interpMatch[1]!;

    // Skip if this is part of a ${{ }} (already caught above)
    if (raw[interpMatch.index + 2] === "{") continue;

    if (!VALID_INTERPOLATION.test(content)) {
      const line = lineNumberAt(interpMatch.index, lines);
      violations.push({
        rule: "no-invalid-interpolation",
        line,
        snippet: `Invalid interpolation: \${${truncateSnippet(content)}}`,
      });
    }
  }

  return violations;
}

// =============================================================================
// AST walker — semantic key + code injection detection
// =============================================================================

const CONDITIONAL_KEYS = new Set(["if", "when", "unless"]);
const LOOP_KEYS = new Set(["for", "each", "forEach", "map"]);

/**
 * Pattern for inline code at the START of a string value.
 * Only matches when the value begins with eval/exec/Function — not mid-sentence.
 * This prevents false positives on descriptions like "avoid eval() in JavaScript".
 */
const INLINE_CODE_START = /^\s*(?:new\s+)?(?:eval|exec|Function)\s*\(/;

/**
 * Walks a parsed YAML object looking for:
 * - Conditional keys (if, when, unless)
 * - Loop keys (for, each, forEach, map)
 * - Inline code values (eval, exec, Function at start of string)
 */
export function walkParsedGovernanceViolations(
  parsed: Record<string, unknown>,
): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];
  walkObject(parsed, "", violations);
  return violations;
}

function walkObject(
  obj: Record<string, unknown>,
  path: string,
  violations: GovernanceViolation[],
): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Check key against banned constructs
    if (CONDITIONAL_KEYS.has(key)) {
      violations.push({
        rule: "no-conditional",
        snippet: `Conditional key "${key}" at ${currentPath}`,
      });
    } else if (LOOP_KEYS.has(key)) {
      violations.push({
        rule: "no-loop",
        snippet: `Loop key "${key}" at ${currentPath}`,
      });
    }

    // Check string values for inline code
    if (typeof value === "string" && INLINE_CODE_START.test(value)) {
      violations.push({
        rule: "no-inline-code",
        snippet: `Inline code in value at ${currentPath}: ${truncateSnippet(value)}`,
      });
    }

    // Recurse into nested structures
    if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            walkObject(item as Record<string, unknown>, `${currentPath}[${i}]`, violations);
          }
        }
      } else {
        walkObject(value as Record<string, unknown>, currentPath, violations);
      }
    }
  }
}

// =============================================================================
// Combined entry point
// =============================================================================

/**
 * Validates a YAML manifest string against all governance rules.
 *
 * Runs both the string scanner (template syntax) and AST walker (semantic keys)
 * and returns a combined list of violations.
 *
 * @param raw — raw YAML string (before interpolation)
 * @returns Array of violations (empty if manifest is governance-compliant)
 */
export function validateManifestGovernance(raw: string): GovernanceViolation[] {
  const stringViolations = scanRawGovernanceViolations(raw);

  // Attempt YAML parse for AST walk — if it fails, string violations are still reported
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    // YAML parse failed — return string-level violations only
    return stringViolations;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return stringViolations;
  }

  const astViolations = walkParsedGovernanceViolations(parsed as Record<string, unknown>);

  return [...stringViolations, ...astViolations];
}

// =============================================================================
// Helpers
// =============================================================================

/** Find the 1-based line number for a character offset */
function lineNumberAt(offset: number, lines: readonly string[]): number {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    pos += lines[i]!.length + 1; // +1 for \n
    if (pos > offset) return i + 1;
  }
  return lines.length;
}

/** Truncate a snippet to a reasonable display length */
function truncateSnippet(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}
