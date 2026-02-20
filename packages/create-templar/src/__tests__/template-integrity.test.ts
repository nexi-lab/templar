import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseManifestYaml } from "@templar/manifest";
import { describe, expect, it } from "vitest";
import { getAvailableTemplates } from "../scaffold.js";

const TEMPLATES = getAvailableTemplates();

describe("template integrity", () => {
  it("has at least one template available", () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES)("templates/%s/templar.yaml parses through manifest schema", (template) => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatesDir = resolve(currentDir, "../../templates");
    const yamlPath = join(templatesDir, template, "templar.yaml");
    const yaml = readFileSync(yamlPath, "utf-8");

    const manifest = parseManifestYaml(yaml, { skipInterpolation: true });
    expect(manifest.name).toBe(template);
    expect(manifest.version).toBeDefined();
    expect(manifest.description).toBeDefined();
  });

  it.each(TEMPLATES)("templates/%s/package.json is valid JSON with template vars", (template) => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatesDir = resolve(currentDir, "../../templates");
    const pkgPath = join(templatesDir, template, "package.json");
    const raw = readFileSync(pkgPath, "utf-8");

    // Should contain template variables before substitution
    expect(raw).toContain("{{name}}");
    expect(raw).toContain("{{description}}");

    // Should be valid JSON (template vars are in string positions)
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe("{{name}}");
    expect(pkg.scripts).toBeDefined();
    expect(pkg.dependencies).toBeDefined();
  });

  it.each(TEMPLATES)("templates/%s has _gitignore file", (template) => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatesDir = resolve(currentDir, "../../templates");
    const gitignorePath = join(templatesDir, template, "_gitignore");
    const content = readFileSync(gitignorePath, "utf-8");

    expect(content).toContain("node_modules");
    expect(content).toContain(".env");
  });

  it.each(TEMPLATES)("templates/%s has _env.example file", (template) => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatesDir = resolve(currentDir, "../../templates");
    const envPath = join(templatesDir, template, "_env.example");
    const content = readFileSync(envPath, "utf-8");

    expect(content).toContain("ANTHROPIC_API_KEY");
  });
});
