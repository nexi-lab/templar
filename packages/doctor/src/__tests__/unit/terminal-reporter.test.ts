import { describe, expect, it } from "vitest";
import { TerminalReporter } from "../../reporters/terminal-reporter.js";
import type { DoctorReport } from "../../types.js";

// Strip ANSI escape codes for assertions
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI stripping
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("TerminalReporter", () => {
  const reporter = new TerminalReporter();

  it("renders check results with ANSI colors", () => {
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
              severity: "CRITICAL",
              title: "Critical issue",
              description: "Something is critical",
              remediation: "Fix it now",
              location: "test.ts",
              owaspRef: ["ASI01"],
            },
          ],
        },
      ],
      summary: {
        total: 1,
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        checksRun: 1,
        checksSkipped: 0,
        checksFailed: 0,
      },
      exitCode: 2,
    };

    const output = reporter.report(report);
    expect(output).toContain("\x1b["); // Has ANSI codes
    const plain = stripAnsi(output);
    expect(plain).toContain("test-check");
    expect(plain).toContain("[CRITICAL]");
    expect(plain).toContain("1 CRITICAL");
  });

  it("groups findings by severity in summary", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 100,
      checkResults: [],
      summary: {
        total: 4,
        critical: 1,
        high: 1,
        medium: 1,
        low: 1,
        checksRun: 4,
        checksSkipped: 0,
        checksFailed: 0,
      },
      exitCode: 2,
    };

    const plain = stripAnsi(reporter.report(report));
    expect(plain).toContain("1 CRITICAL");
    expect(plain).toContain("1 HIGH");
    expect(plain).toContain("1 MEDIUM");
    expect(plain).toContain("1 LOW");
  });

  it("shows timing info", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 250,
      checkResults: [{ checkName: "fast-check", status: "passed", durationMs: 25, findings: [] }],
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

    const plain = stripAnsi(reporter.report(report));
    expect(plain).toContain("250ms");
    expect(plain).toContain("25ms");
  });

  it("shows success message when no findings", () => {
    const report: DoctorReport = {
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 100,
      checkResults: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        checksRun: 0,
        checksSkipped: 0,
        checksFailed: 0,
      },
      exitCode: 0,
    };

    const plain = stripAnsi(reporter.report(report));
    expect(plain).toContain("No findings");
  });
});
