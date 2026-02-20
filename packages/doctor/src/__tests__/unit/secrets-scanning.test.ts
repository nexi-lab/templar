import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretsScanningCheck } from "../../checks/secrets-scanning.js";

describe("SecretsScanningCheck", () => {
  const check = new SecretsScanningCheck();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-sec-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects OpenAI API keys", async () => {
    await fs.writeFile(
      path.join(tmpDir, "config.ts"),
      `const key = "sk-abcdefghij1234567890abcdefghij";`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SEC-001")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects AWS access keys", async () => {
    await fs.writeFile(path.join(tmpDir, "config.ts"), `const aws = "AKIAIOSFODNN7EXAMPLE";`);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SEC-001")).toBe(true);
  });

  it("detects generic password patterns", async () => {
    await fs.writeFile(path.join(tmpDir, "config.json"), `{"password": "mysecretpassword123"}`);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SEC-003")).toBe(true);
  });

  it("reports .env not in .gitignore", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "SECRET=value");
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "dist/\n");

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SEC-002")).toBe(true);
  });

  it("passes when .env is properly gitignored", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "SECRET=value");
    await fs.writeFile(path.join(tmpDir, ".gitignore"), ".env\ndist/\n");

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SEC-002")).toBe(false);
  });

  it("skips files over 1MB", async () => {
    const largeContent = "x".repeat(2_000_000);
    await fs.writeFile(path.join(tmpDir, "large.ts"), largeContent);

    const result = await check.run({ workspace: tmpDir });
    // Should not find anything in the large file
    expect(result.findings.filter((f) => f.location === "large.ts")).toHaveLength(0);
  });
});
