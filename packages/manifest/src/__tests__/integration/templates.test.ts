import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifestYaml } from "../../parser.js";

const templatesDir = resolve(__dirname, "../../../../../templates");

const templateDirs = readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("template validation", () => {
  it("discovers at least 5 templates", () => {
    expect(templateDirs.length).toBeGreaterThanOrEqual(5);
  });

  it.each(templateDirs)("templates/%s/templar.yaml validates", (name) => {
    const yamlPath = join(templatesDir, name, "templar.yaml");
    const yaml = readFileSync(yamlPath, "utf-8");
    const manifest = parseManifestYaml(yaml, { skipInterpolation: true });
    expect(manifest.name).toBe(name);
  });

  it.each(templateDirs)("templates/%s has required files", (name) => {
    const dir = join(templatesDir, name);
    expect(existsSync(join(dir, "templar.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".env.example"))).toBe(true);
    expect(existsSync(join(dir, "README.md"))).toBe(true);
  });

  it.each(templateDirs)("templates/%s has a description", (name) => {
    const yamlPath = join(templatesDir, name, "templar.yaml");
    const yaml = readFileSync(yamlPath, "utf-8");
    const manifest = parseManifestYaml(yaml, { skipInterpolation: true });
    expect(manifest.description.length).toBeGreaterThan(0);
  });
});
