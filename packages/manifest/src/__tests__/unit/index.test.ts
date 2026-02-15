import { describe, expect, it } from "vitest";
import * as manifest from "../../index.js";

describe("@templar/manifest exports", () => {
  it("exports PACKAGE_NAME as @templar/manifest", () => {
    expect(manifest.PACKAGE_NAME).toBe("@templar/manifest");
  });

  it("exports loadManifest function", () => {
    expect(typeof manifest.loadManifest).toBe("function");
  });

  it("exports parseManifestYaml function", () => {
    expect(typeof manifest.parseManifestYaml).toBe("function");
  });

  it("exports AgentManifestSchema", () => {
    expect(manifest.AgentManifestSchema).toBeDefined();
    expect(typeof manifest.AgentManifestSchema.safeParse).toBe("function");
  });

  it("exports interpolateEnvVars function", () => {
    expect(typeof manifest.interpolateEnvVars).toBe("function");
  });

  it("exports deepFreeze function", () => {
    expect(typeof manifest.deepFreeze).toBe("function");
  });

  // Bootstrap exports
  it("exports resolveBootstrapFiles function", () => {
    expect(typeof manifest.resolveBootstrapFiles).toBe("function");
  });

  it("exports DEFAULT_BUDGET", () => {
    expect(manifest.DEFAULT_BUDGET).toBeDefined();
    expect(manifest.DEFAULT_BUDGET.instructions).toBe(10_000);
  });

  it("exports BOOTSTRAP_FILENAMES", () => {
    expect(manifest.BOOTSTRAP_FILENAMES).toBeDefined();
    expect(Object.keys(manifest.BOOTSTRAP_FILENAMES)).toEqual([
      "instructions",
      "tools",
      "context",
    ]);
  });

  it("exports truncateContent function", () => {
    expect(typeof manifest.truncateContent).toBe("function");
  });

  it("exports readTextFile and fileExists functions", () => {
    expect(typeof manifest.readTextFile).toBe("function");
    expect(typeof manifest.fileExists).toBe("function");
  });

  it("exports BootstrapPathConfigSchema", () => {
    expect(manifest.BootstrapPathConfigSchema).toBeDefined();
    expect(typeof manifest.BootstrapPathConfigSchema.safeParse).toBe("function");
  });
});
