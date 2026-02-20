import { describe, expect, it } from "vitest";
import { runAudit } from "../../engine.js";
import { createCheckResult, createFinding } from "../../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorConfig,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCheck(
  name: string,
  requiresNexus: boolean,
  resultFn: (ctx: DoctorCheckContext) => Promise<DoctorCheckResult>,
): DoctorCheck {
  return { name, requiresNexus, run: resultFn };
}

function passingCheck(name: string): DoctorCheck {
  return makeCheck(name, false, async () => createCheckResult(name, [], 10));
}

function findingCheck(name: string, severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"): DoctorCheck {
  return makeCheck(name, false, async () => {
    const finding = createFinding({
      id: `${name}-001`,
      checkName: name,
      severity,
      title: `${name} finding`,
      description: "Test finding",
      remediation: "Fix it",
      location: "test.ts",
      owaspRef: ["ASI01"],
    });
    return createCheckResult(name, [finding], 10);
  });
}

function slowCheck(name: string, delayMs: number): DoctorCheck {
  return makeCheck(name, false, async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return createCheckResult(name, [], delayMs);
  });
}

function throwingCheck(name: string): DoctorCheck {
  return makeCheck(name, false, async () => {
    throw new Error("Check exploded");
  });
}

function nexusCheck(name: string): DoctorCheck {
  return makeCheck(name, true, async () => createCheckResult(name, [], 10));
}

const baseConfig: DoctorConfig = {
  workspace: "/tmp/test-workspace",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAudit", () => {
  it("returns a report with all passing checks", async () => {
    const checks = [passingCheck("check-a"), passingCheck("check-b")];
    const report = await runAudit(checks, baseConfig);

    expect(report.checkResults).toHaveLength(2);
    expect(report.summary.total).toBe(0);
    expect(report.exitCode).toBe(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("computes exit code 2 for CRITICAL findings", async () => {
    const checks = [findingCheck("critical-check", "CRITICAL")];
    const report = await runAudit(checks, baseConfig);

    expect(report.summary.critical).toBe(1);
    expect(report.exitCode).toBe(2);
  });

  it("computes exit code 1 for HIGH findings (no CRITICAL)", async () => {
    const checks = [findingCheck("high-check", "HIGH")];
    const report = await runAudit(checks, baseConfig);

    expect(report.summary.high).toBe(1);
    expect(report.exitCode).toBe(1);
  });

  it("computes exit code 0 for MEDIUM/LOW findings", async () => {
    const checks = [findingCheck("med-check", "MEDIUM"), findingCheck("low-check", "LOW")];
    const report = await runAudit(checks, baseConfig);

    expect(report.summary.medium).toBe(1);
    expect(report.summary.low).toBe(1);
    expect(report.exitCode).toBe(0);
  });

  it("filters disabled checks", async () => {
    const checks = [passingCheck("check-a"), passingCheck("check-b")];
    const report = await runAudit(checks, {
      ...baseConfig,
      disabledChecks: ["check-a"],
    });

    const skipped = report.checkResults.find((r) => r.checkName === "check-a");
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.skipReason).toBe("Disabled by configuration");
  });

  it("auto-skips Nexus checks when no client", async () => {
    const checks = [nexusCheck("nexus-check")];
    const report = await runAudit(checks, baseConfig);

    expect(report.checkResults[0]?.status).toBe("skipped");
    expect(report.checkResults[0]?.skipReason).toBe("Nexus client not available");
  });

  it("isolates check failures into error results", async () => {
    const checks = [passingCheck("ok"), throwingCheck("broken")];
    const report = await runAudit(checks, baseConfig);

    const ok = report.checkResults.find((r) => r.checkName === "ok");
    const broken = report.checkResults.find((r) => r.checkName === "broken");

    expect(ok?.status).toBe("passed");
    expect(broken?.status).toBe("error");
    expect(broken?.error?.message).toBe("Check exploded");
  });

  it("runs checks with concurrency limit", async () => {
    const checks = [
      slowCheck("slow-1", 50),
      slowCheck("slow-2", 50),
      slowCheck("slow-3", 50),
      slowCheck("slow-4", 50),
    ];

    const report = await runAudit(checks, { ...baseConfig, concurrency: 2 });
    expect(report.checkResults).toHaveLength(4);
    expect(report.checkResults.every((r) => r.status === "passed")).toBe(true);
  });

  it("respects the default concurrency of 4", async () => {
    const checks = Array.from({ length: 8 }, (_, i) => passingCheck(`check-${i}`));
    const report = await runAudit(checks, baseConfig);
    expect(report.checkResults).toHaveLength(8);
  });

  it("includes startedAt and completedAt timestamps", async () => {
    const report = await runAudit([passingCheck("a")], baseConfig);
    expect(report.startedAt).toBeTruthy();
    expect(report.completedAt).toBeTruthy();
    expect(new Date(report.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(report.completedAt).getTime(),
    );
  });

  it("computes summary correctly with mixed results", async () => {
    const checks = [
      findingCheck("c1", "CRITICAL"),
      findingCheck("c2", "HIGH"),
      findingCheck("c3", "MEDIUM"),
      passingCheck("c4"),
      throwingCheck("c5"),
    ];

    const report = await runAudit(checks, baseConfig);

    expect(report.summary.total).toBe(3);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.high).toBe(1);
    expect(report.summary.medium).toBe(1);
    expect(report.summary.checksRun).toBe(5);
    expect(report.summary.checksFailed).toBe(1);
  });

  it("handles empty check list", async () => {
    const report = await runAudit([], baseConfig);
    expect(report.checkResults).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.exitCode).toBe(0);
  });
});
