import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesystemPermissionsCheck } from "../../checks/filesystem-permissions.js";

describe("FilesystemPermissionsCheck", () => {
  const check = new FilesystemPermissionsCheck();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-fs-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects world-writable sensitive files", async () => {
    const envFile = path.join(tmpDir, ".env");
    await fs.writeFile(envFile, "SECRET=value");
    await fs.chmod(envFile, 0o666);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "FS-001")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects group-writable sensitive files", async () => {
    const keyFile = path.join(tmpDir, "server.key");
    await fs.writeFile(keyFile, "key content");
    await fs.chmod(keyFile, 0o664);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "FS-002")).toBe(true);
    expect(result.findings.some((f) => f.severity === "HIGH")).toBe(true);
  });

  it("passes when files have correct permissions", async () => {
    const envFile = path.join(tmpDir, ".env");
    await fs.writeFile(envFile, "SECRET=value");
    await fs.chmod(envFile, 0o600);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe("passed");
  });

  it("passes when no sensitive files exist", async () => {
    await fs.writeFile(path.join(tmpDir, "readme.txt"), "hello");

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe("passed");
  });

  it("skips on Windows", async () => {
    if (process.platform === "win32") {
      const result = await check.run({ workspace: tmpDir });
      expect(result.status).toBe("skipped");
    } else {
      // On non-Windows, just verify it doesn't skip
      const result = await check.run({ workspace: tmpDir });
      expect(result.status).not.toBe("skipped");
    }
  });
});
