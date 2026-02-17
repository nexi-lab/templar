import { describe, expect, it } from "vitest";
import {
  type GovernanceViolation,
  scanRawGovernanceViolations,
  validateManifestGovernance,
  walkParsedGovernanceViolations,
} from "../../governance.js";
import {
  VALID_FULL_YAML,
  VALID_MINIMAL_YAML,
  YAML_WITH_COMPLEX_EXPR,
  YAML_WITH_DOUBLE_BRACE,
  YAML_WITH_FUNC_CALL_ENV,
  YAML_WITH_GO_TEMPLATE,
  YAML_WITH_JINJA2_BLOCK,
  YAML_WITH_JINJA2_VAR,
  YAML_WITH_LOWERCASE_ENV,
  YAML_WITH_MULTIPLE_VIOLATIONS,
  YAML_WITH_VALID_ENV_VARS_GOVERNANCE,
} from "../helpers/fixtures.js";

// =============================================================================
// String scanner — template syntax violations
// =============================================================================

describe("scanRawGovernanceViolations", () => {
  it("rejects ${{ expression }} (GitHub Actions style)", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_DOUBLE_BRACE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-template-expression");
  });

  it("rejects {{ variable }} (Jinja2/Go template)", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_JINJA2_VAR);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-template-expression");
  });

  it("rejects {% block %} (Jinja2 block)", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_JINJA2_BLOCK);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-template-expression");
  });

  it("rejects {{ .Value }} (Go template)", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_GO_TEMPLATE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-template-expression");
  });

  it("rejects ${lowercase} env var names", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_LOWERCASE_ENV);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-invalid-interpolation");
  });

  it("rejects ${complex.path} expressions", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_COMPLEX_EXPR);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-invalid-interpolation");
  });

  it("rejects ${getSecret()} function calls in env vars", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_FUNC_CALL_ENV);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-invalid-interpolation");
  });

  it("allows ${UPPER_CASE} env vars", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_VALID_ENV_VARS_GOVERNANCE);
    expect(violations).toEqual([]);
  });

  it("returns no violations for a clean minimal manifest", () => {
    const violations = scanRawGovernanceViolations(VALID_MINIMAL_YAML);
    expect(violations).toEqual([]);
  });

  it("returns no violations for a clean full manifest", () => {
    const violations = scanRawGovernanceViolations(VALID_FULL_YAML);
    expect(violations).toEqual([]);
  });

  it("includes line numbers in violations", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_DOUBLE_BRACE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].line).toBeTypeOf("number");
    expect(violations[0].line).toBeGreaterThan(0);
  });

  it("includes the offending snippet in violations", () => {
    const violations = scanRawGovernanceViolations(YAML_WITH_DOUBLE_BRACE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].snippet).toContain("${{");
  });

  it("returns empty array for empty string", () => {
    const violations = scanRawGovernanceViolations("");
    expect(violations).toEqual([]);
  });
});

// =============================================================================
// AST walker — semantic key violations
// =============================================================================

describe("walkParsedGovernanceViolations", () => {
  it("rejects 'if' key at top level", () => {
    const parsed = { name: "test", if: "production" };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-conditional");
  });

  it("rejects 'when' key at any level", () => {
    const parsed = {
      name: "test",
      tools: [{ name: "search", description: "Search", when: "enabled" }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-conditional");
  });

  it("rejects 'unless' key", () => {
    const parsed = { name: "test", unless: "disabled" };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-conditional");
  });

  it("rejects 'for' key", () => {
    const parsed = { name: "test", for: "each_channel" };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-loop");
  });

  it("rejects 'each' key", () => {
    const parsed = { name: "test", config: { each: "item" } };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-loop");
  });

  it("rejects 'forEach' key", () => {
    const parsed = { name: "test", config: { forEach: "channel" } };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-loop");
  });

  it("rejects 'map' key", () => {
    const parsed = { name: "test", config: { map: "transform" } };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-loop");
  });

  it("rejects nested conditional keys", () => {
    const parsed = {
      name: "test",
      channels: [{ type: "slack", config: { settings: { if: "debug" } } }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-conditional");
    expect(violations[0].snippet).toContain("if");
  });

  it("rejects eval() at start of string value", () => {
    const parsed = {
      name: "test",
      tools: [{ name: "dynamic", description: "eval(getToolConfig())" }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-inline-code");
  });

  it("rejects exec() at start of string value", () => {
    const parsed = {
      name: "test",
      tools: [{ name: "runner", description: "exec(command)" }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-inline-code");
  });

  it('rejects Function("...") at start of string value', () => {
    const parsed = {
      name: "test",
      tools: [{ name: "dynamic", description: 'Function("return 42")' }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-inline-code");
  });

  it('rejects new Function("...") at start of string value', () => {
    const parsed = {
      name: "test",
      tools: [{ name: "dynamic", description: 'new Function("return 42")' }],
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-inline-code");
  });

  it("allows eval in prose (mid-sentence, not at start)", () => {
    const parsed = {
      name: "safe",
      description: "Helps developers avoid unsafe patterns like eval() in JavaScript code",
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations).toEqual([]);
  });

  it("returns no violations for a clean object", () => {
    const parsed = {
      name: "test-agent",
      version: "1.0.0",
      description: "A test agent",
      model: { provider: "anthropic", name: "claude-sonnet-4-5" },
    };
    const violations = walkParsedGovernanceViolations(parsed);
    expect(violations).toEqual([]);
  });
});

// =============================================================================
// Combined entry point
// =============================================================================

describe("validateManifestGovernance", () => {
  it("returns violations from both string scan and AST walk", () => {
    const violations = validateManifestGovernance(YAML_WITH_MULTIPLE_VIOLATIONS);
    // Should have template expression (${{ }}) + jinja block ({% %}) + structural (if:)
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const rules = violations.map((v: GovernanceViolation) => v.rule);
    expect(rules).toContain("no-template-expression");
    expect(rules).toContain("no-conditional");
  });

  it("returns empty array for a clean manifest", () => {
    const violations = validateManifestGovernance(VALID_MINIMAL_YAML);
    expect(violations).toEqual([]);
  });

  it("returns empty array for a full clean manifest", () => {
    const violations = validateManifestGovernance(VALID_FULL_YAML);
    expect(violations).toEqual([]);
  });
});
