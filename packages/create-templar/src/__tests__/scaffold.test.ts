import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAvailableTemplates, scaffold } from "../scaffold.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `create-templar-test-${randomUUID()}`);
  return dir;
}

const TEMPLATES = getAvailableTemplates();

describe("scaffold", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("lists all 5 templates", () => {
    expect(TEMPLATES).toHaveLength(5);
    expect(TEMPLATES).toContain("code-builder");
    expect(TEMPLATES).toContain("daily-digest");
    expect(TEMPLATES).toContain("inbox-assistant");
    expect(TEMPLATES).toContain("knowledge-base");
    expect(TEMPLATES).toContain("research-tracker");
  });

  it.each(TEMPLATES)("scaffolds %s with all expected files", (template) => {
    const targetDir = makeTmpDir();
    dirs.push(targetDir);

    const result = scaffold({
      projectName: "test-agent",
      template,
      description: "Test description",
      targetDir,
      overwrite: false,
    });

    // Core files exist
    expect(existsSync(join(targetDir, "templar.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, "README.md"))).toBe(true);
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);

    // Renamed files
    expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);

    // Originals should NOT exist
    expect(existsSync(join(targetDir, "_gitignore"))).toBe(false);
    expect(existsSync(join(targetDir, "_env.example"))).toBe(false);

    expect(result.targetDir).toBe(targetDir);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES)("substitutes variables in %s package.json", (template) => {
    const targetDir = makeTmpDir();
    dirs.push(targetDir);

    scaffold({
      projectName: "my-cool-agent",
      template,
      description: "A cool agent",
      targetDir,
      overwrite: false,
    });

    const pkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-cool-agent");
    expect(pkg.description).toBe("A cool agent");
  });

  it("overwrites existing directory when overwrite is true", () => {
    const targetDir = makeTmpDir();
    dirs.push(targetDir);

    // First scaffold
    scaffold({
      projectName: "test-agent",
      template: "code-builder",
      description: "First",
      targetDir,
      overwrite: false,
    });

    // Second scaffold with overwrite
    const result = scaffold({
      projectName: "test-agent-v2",
      template: "code-builder",
      description: "Second",
      targetDir,
      overwrite: true,
    });

    const pkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("test-agent-v2");
    expect(pkg.description).toBe("Second");
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("throws for unknown template", () => {
    const targetDir = makeTmpDir();
    dirs.push(targetDir);

    expect(() =>
      scaffold({
        projectName: "test",
        template: "nonexistent",
        description: "test",
        targetDir,
        overwrite: false,
      }),
    ).toThrow('Template "nonexistent" not found');
  });

  it("creates target directory if it does not exist", () => {
    const targetDir = join(makeTmpDir(), "nested", "deep");
    dirs.push(targetDir);

    scaffold({
      projectName: "test-agent",
      template: "code-builder",
      description: "Test",
      targetDir,
      overwrite: false,
    });

    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
  });

  it("code-builder includes TEMPLAR.md", () => {
    const targetDir = makeTmpDir();
    dirs.push(targetDir);

    scaffold({
      projectName: "test-agent",
      template: "code-builder",
      description: "Test",
      targetDir,
      overwrite: false,
    });

    expect(existsSync(join(targetDir, "TEMPLAR.md"))).toBe(true);
  });
});
