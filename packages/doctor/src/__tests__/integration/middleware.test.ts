import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DoctorCheckFailedError, DoctorConfigurationError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckResult } from "../../finding-factory.js";
import { DoctorMiddleware } from "../../middleware.js";
import type { DoctorCheck, DoctorCheckResult } from "../../types.js";

describe("DoctorMiddleware (Integration)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-mw-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("throws DoctorConfigurationError for missing workspace", () => {
    expect(() => new DoctorMiddleware({ workspace: "" })).toThrow(DoctorConfigurationError);
  });

  it("runs audit on session start", async () => {
    const mw = new DoctorMiddleware({ workspace: tmpDir });
    expect(mw.getReport()).toBeNull();

    await mw.onSessionStart();
    const report = mw.getReport();
    expect(report).not.toBeNull();
    expect(report?.checkResults.length).toBeGreaterThan(0);
  });

  it("throws DoctorCheckFailedError on CRITICAL findings", async () => {
    // Create a workspace with CRITICAL issues
    const envFile = path.join(tmpDir, ".env");
    await fs.writeFile(envFile, "SECRET=value");
    await fs.chmod(envFile, 0o666); // World-writable

    const mw = new DoctorMiddleware({ workspace: tmpDir });

    await expect(mw.onSessionStart()).rejects.toThrow(DoctorCheckFailedError);
  });

  it("passes on a clean workspace", async () => {
    const mw = new DoctorMiddleware({ workspace: tmpDir });

    // Should not throw
    await mw.onSessionStart();
    const report = mw.getReport();
    expect(report?.summary.critical).toBe(0);
  });

  it("caches report after first run", async () => {
    const mw = new DoctorMiddleware({ workspace: tmpDir });
    await mw.onSessionStart();
    const report1 = mw.getReport();
    expect(report1).not.toBeNull();

    // Second call returns same report (report is set once)
    const report2 = mw.getReport();
    expect(report2).toBe(report1);
  });

  it("includes custom checks alongside built-in checks", async () => {
    const customCheck: DoctorCheck = {
      name: "custom-check",
      requiresNexus: false,
      async run(): Promise<DoctorCheckResult> {
        return createCheckResult("custom-check", [], 1);
      },
    };

    const mw = new DoctorMiddleware({
      workspace: tmpDir,
      checks: [customCheck],
    });

    await mw.onSessionStart();
    const report = mw.getReport();
    const custom = report?.checkResults.find((r) => r.checkName === "custom-check");
    expect(custom).toBeDefined();
    expect(custom?.status).toBe("passed");
  });

  it("onSessionEnd is a no-op", async () => {
    const mw = new DoctorMiddleware({ workspace: tmpDir });
    await mw.onSessionStart();
    await expect(mw.onSessionEnd()).resolves.toBeUndefined();
  });
});
