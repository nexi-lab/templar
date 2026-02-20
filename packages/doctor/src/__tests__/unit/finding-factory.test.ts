import { describe, expect, it } from "vitest";
import {
  createCheckResult,
  createErrorResult,
  createFinding,
  createSkippedResult,
} from "../../finding-factory.js";

describe("createFinding", () => {
  it("creates an immutable finding with all required fields", () => {
    const finding = createFinding({
      id: "TEST-001",
      checkName: "test-check",
      severity: "HIGH",
      title: "Test finding",
      description: "A test finding",
      remediation: "Fix it",
      location: "test.ts",
      owaspRef: ["ASI01"],
    });

    expect(finding.id).toBe("TEST-001");
    expect(finding.checkName).toBe("test-check");
    expect(finding.severity).toBe("HIGH");
    expect(finding.title).toBe("Test finding");
    expect(finding.description).toBe("A test finding");
    expect(finding.remediation).toBe("Fix it");
    expect(finding.location).toBe("test.ts");
    expect(finding.owaspRef).toEqual(["ASI01"]);
    expect(finding.metadata).toBeUndefined();
  });

  it("includes metadata when provided via spread pattern", () => {
    const finding = createFinding({
      id: "TEST-002",
      checkName: "test-check",
      severity: "LOW",
      title: "Test",
      description: "Test",
      remediation: "Test",
      location: "test.ts",
      owaspRef: [],
      metadata: { key: "value" },
    });

    expect(finding.metadata).toEqual({ key: "value" });
  });

  it("omits metadata key when not provided", () => {
    const finding = createFinding({
      id: "TEST-003",
      checkName: "test-check",
      severity: "LOW",
      title: "Test",
      description: "Test",
      remediation: "Test",
      location: "test.ts",
      owaspRef: [],
    });

    expect("metadata" in finding).toBe(false);
  });

  it("supports multiple OWASP references", () => {
    const finding = createFinding({
      id: "TEST-004",
      checkName: "test-check",
      severity: "CRITICAL",
      title: "Test",
      description: "Test",
      remediation: "Test",
      location: "test.ts",
      owaspRef: ["ASI01", "ASI03", "ASI07"],
    });

    expect(finding.owaspRef).toEqual(["ASI01", "ASI03", "ASI07"]);
  });
});

describe("createCheckResult", () => {
  it("returns 'passed' status when no findings", () => {
    const result = createCheckResult("test-check", [], 100);
    expect(result.status).toBe("passed");
    expect(result.checkName).toBe("test-check");
    expect(result.durationMs).toBe(100);
    expect(result.findings).toEqual([]);
  });

  it("returns 'findings' status when findings exist", () => {
    const finding = createFinding({
      id: "TEST-001",
      checkName: "test-check",
      severity: "HIGH",
      title: "Test",
      description: "Test",
      remediation: "Test",
      location: "test.ts",
      owaspRef: [],
    });

    const result = createCheckResult("test-check", [finding], 50);
    expect(result.status).toBe("findings");
    expect(result.findings).toHaveLength(1);
  });
});

describe("createSkippedResult", () => {
  it("creates a skipped result with reason", () => {
    const result = createSkippedResult("test-check", "Not supported");
    expect(result.status).toBe("skipped");
    expect(result.checkName).toBe("test-check");
    expect(result.skipReason).toBe("Not supported");
    expect(result.durationMs).toBe(0);
    expect(result.findings).toEqual([]);
  });
});

describe("createErrorResult", () => {
  it("creates an error result with the error object", () => {
    const error = new Error("Something went wrong");
    const result = createErrorResult("test-check", error, 200);
    expect(result.status).toBe("error");
    expect(result.checkName).toBe("test-check");
    expect(result.error).toBe(error);
    expect(result.durationMs).toBe(200);
    expect(result.findings).toEqual([]);
  });
});
