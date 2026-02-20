import { describe, expect, it } from "vitest";
import { JsonReporter } from "../../reporters/json-reporter.js";
import type { DoctorReport } from "../../types.js";

describe("JsonReporter", () => {
  const reporter = new JsonReporter();

  it("outputs valid JSON", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 100,
      checkResults: [{ checkName: "test-check", status: "passed", durationMs: 50, findings: [] }],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        checksRun: 1,
        checksSkipped: 0,
        checksFailed: 0,
      },
      exitCode: 0,
    };

    const output = reporter.report(report);
    const parsed = JSON.parse(output);
    expect(parsed.startedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(parsed.exitCode).toBe(0);
  });

  it("includes full structure with findings", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 100,
      checkResults: [
        {
          checkName: "test-check",
          status: "findings",
          durationMs: 50,
          findings: [
            {
              id: "T-001",
              checkName: "test-check",
              severity: "HIGH",
              title: "Test finding",
              description: "A test",
              remediation: "Fix it",
              location: "test.ts",
              owaspRef: ["ASI01"],
            },
          ],
        },
      ],
      summary: {
        total: 1,
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        checksRun: 1,
        checksSkipped: 0,
        checksFailed: 0,
      },
      exitCode: 1,
    };

    const parsed = JSON.parse(reporter.report(report));
    expect(parsed.checkResults[0].findings[0].id).toBe("T-001");
    expect(parsed.summary.high).toBe(1);
  });

  it("serializes error objects correctly", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 100,
      checkResults: [
        {
          checkName: "broken",
          status: "error",
          durationMs: 10,
          findings: [],
          error: new Error("Something broke"),
        },
      ],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        checksRun: 1,
        checksSkipped: 0,
        checksFailed: 1,
      },
      exitCode: 0,
    };

    const parsed = JSON.parse(reporter.report(report));
    expect(parsed.checkResults[0].error.message).toBe("Something broke");
    expect(parsed.checkResults[0].error.name).toBe("Error");
  });
});
