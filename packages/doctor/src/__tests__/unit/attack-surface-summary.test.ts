import { describe, expect, it } from "vitest";
import { generateAttackSurfaceSummary } from "../../checks/attack-surface-summary.js";
import { createCheckResult, createFinding, createSkippedResult } from "../../finding-factory.js";

describe("generateAttackSurfaceSummary", () => {
  it("generates AS-001 when >5 critical/high findings", () => {
    const findings = Array.from({ length: 6 }, (_, i) =>
      createFinding({
        id: `TEST-${i}`,
        checkName: "test",
        severity: i < 3 ? "CRITICAL" : "HIGH",
        title: `Finding ${i}`,
        description: "Test",
        remediation: "Fix",
        location: "test.ts",
        owaspRef: ["ASI01"],
      }),
    );

    const results = [createCheckResult("test", findings, 10)];
    const summary = generateAttackSurfaceSummary(results);

    expect(summary.some((f) => f.id === "AS-001")).toBe(true);
    expect(summary.some((f) => f.severity === "HIGH")).toBe(true);
  });

  it("generates AS-002 when checks are skipped", () => {
    const results = [
      createCheckResult("check-a", [], 10),
      createSkippedResult("check-b", "No Nexus"),
    ];

    const summary = generateAttackSurfaceSummary(results);
    expect(summary.some((f) => f.id === "AS-002")).toBe(true);
  });

  it("returns empty findings for clean results", () => {
    const results = [createCheckResult("check-a", [], 10), createCheckResult("check-b", [], 10)];

    const summary = generateAttackSurfaceSummary(results);
    // No findings, no skips → no AS-001, no AS-002, no AS-003
    expect(summary).toHaveLength(0);
  });
});
