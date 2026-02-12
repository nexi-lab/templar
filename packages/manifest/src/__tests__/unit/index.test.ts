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
});
