import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillCodeSafetyCheck } from "../../checks/skill-code-safety.js";

describe("SkillCodeSafetyCheck", () => {
  const check = new SkillCodeSafetyCheck();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-skill-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects eval() in skill code", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "dangerous.ts"), `const result = eval("1 + 1");`);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SK-001")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects child_process in skill code", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "runner.ts"), `import { exec } from "child_process";`);

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SK-002")).toBe(true);
  });

  it("detects dynamic import in skill code", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, "loader.ts"),
      `const mod = await import("./dangerous");`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SK-005")).toBe(true);
  });

  it("extracts and scans code from SKILL.md", async () => {
    await fs.writeFile(
      path.join(tmpDir, "SKILL.md"),
      "# Skill\n\n```typescript\nconst x = eval('test');\n```\n",
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "SK-001")).toBe(true);
  });

  it("passes with clean skill code", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, "safe.ts"),
      `export function greet(name: string) { return "Hello, " + name; }`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe("passed");
  });

  it("handles missing skills directory", async () => {
    const result = await check.run({ workspace: tmpDir });
    expect(result.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });
});
