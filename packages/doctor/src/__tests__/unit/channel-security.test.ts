import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelSecurityCheck } from "../../checks/channel-security.js";

describe("ChannelSecurityCheck", () => {
  const check = new ChannelSecurityCheck();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-ch-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects HTTP webhook URLs", async () => {
    await fs.writeFile(
      path.join(tmpDir, "templar.yaml"),
      `channels:\n  - name: slack\n    webhook: http://example.com/hook\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "CH-003")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects missing allowlist", async () => {
    await fs.writeFile(
      path.join(tmpDir, "templar.yaml"),
      `channels:\n  - name: discord\n    type: discord\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "CH-002")).toBe(true);
  });

  it("detects open DM without allowlist", async () => {
    await fs.writeFile(
      path.join(tmpDir, "templar.yaml"),
      `channels:\n  - name: telegram\n    allowDM: true\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "CH-001")).toBe(true);
  });

  it("passes for HTTPS webhook with allowlist", async () => {
    await fs.writeFile(
      path.join(tmpDir, "templar.yaml"),
      `channels:\n  - name: slack\n    webhook: https://example.com/hook\n    allowlist:\n      - user1\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "CH-003")).toBe(false);
  });

  it("handles malformed YAML gracefully", async () => {
    await fs.writeFile(path.join(tmpDir, "templar.yaml"), ":::invalid yaml{{{");

    const result = await check.run({ workspace: tmpDir });
    expect(result.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });
});
