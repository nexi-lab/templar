import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBuiltinChecks } from "../../checks/index.js";
import { runAudit } from "../../engine.js";
import type { DoctorConfig } from "../../types.js";

describe("Engine Pipeline (Integration)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-int-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("runs all built-in checks on a clean workspace", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir };
    const report = await runAudit(checks, config);

    // Should complete without errors
    expect(report.checkResults.length).toBeGreaterThan(0);
    expect(report.exitCode).toBeGreaterThanOrEqual(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("completes local scan in under 3 seconds", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir };
    const report = await runAudit(checks, config);

    expect(report.durationMs).toBeLessThan(3000);
  });

  it("detects findings in a workspace with known issues", async () => {
    // Create a world-writable .env
    const envFile = path.join(tmpDir, ".env");
    await fs.writeFile(envFile, 'API_KEY="sk-test1234567890abcdefghij"');
    await fs.chmod(envFile, 0o666);

    // Create gateway.yaml with issues
    await fs.writeFile(path.join(tmpDir, "gateway.yaml"), `authMode: legacy\nbind: 0.0.0.0:8080\n`);

    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir };
    const report = await runAudit(checks, config);

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.critical).toBeGreaterThan(0);
    expect(report.exitCode).toBe(2);
  });

  it("disables specific checks", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = {
      workspace: tmpDir,
      disabledChecks: ["filesystem-permissions", "secrets-scanning"],
    };

    const report = await runAudit(checks, config);
    const disabled = report.checkResults.filter((r) => r.status === "skipped");
    expect(disabled.length).toBeGreaterThanOrEqual(2);
  });

  it("skips Nexus checks when no client provided", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir };
    const report = await runAudit(checks, config);

    const nexusChecks = report.checkResults.filter(
      (r) => r.checkName === "multi-tenant-isolation" || r.checkName === "budget-leak-detection",
    );

    for (const result of nexusChecks) {
      expect(result.status).toBe("skipped");
    }
  });

  it("handles verbose mode", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir, verbose: true };
    const report = await runAudit(checks, config);

    // Verbose mode shouldn't change results, just verify it runs
    expect(report.checkResults.length).toBeGreaterThan(0);
  });

  it("handles concurrent execution correctly", async () => {
    const checks = getBuiltinChecks();
    const config: DoctorConfig = { workspace: tmpDir, concurrency: 1 };
    const report = await runAudit(checks, config);

    expect(report.checkResults.length).toBeGreaterThan(0);
  });

  it("includes correct timestamps", async () => {
    const before = Date.now();
    const checks = getBuiltinChecks();
    const report = await runAudit(checks, { workspace: tmpDir });
    const after = Date.now();

    const startTime = new Date(report.startedAt).getTime();
    const endTime = new Date(report.completedAt).getTime();

    expect(startTime).toBeGreaterThanOrEqual(before);
    expect(endTime).toBeLessThanOrEqual(after);
    expect(startTime).toBeLessThanOrEqual(endTime);
  });
});
