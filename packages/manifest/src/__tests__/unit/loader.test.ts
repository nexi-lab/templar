import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ManifestFileNotFoundError, ManifestSchemaError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadManifest } from "../../loader.js";
import { VALID_FULL_YAML, VALID_MINIMAL_YAML, YAML_WITH_ENV_VARS } from "../helpers/fixtures.js";

describe("loadManifest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "templar-manifest-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads a valid YAML file from disk", async () => {
    const filePath = join(tmpDir, "templar.yaml");
    await writeFile(filePath, VALID_MINIMAL_YAML, "utf-8");

    const manifest = await loadManifest(filePath);
    expect(manifest.name).toBe("test-agent");
    expect(manifest.version).toBe("1.0.0");
  });

  it("loads a full manifest file", async () => {
    const filePath = join(tmpDir, "full.yaml");
    await writeFile(filePath, VALID_FULL_YAML, "utf-8");

    const manifest = await loadManifest(filePath);
    expect(manifest.tools).toHaveLength(2);
    expect(manifest.model?.provider).toBe("anthropic");
  });

  it("throws ManifestFileNotFoundError for missing file", async () => {
    const badPath = join(tmpDir, "nope.yaml");
    await expect(loadManifest(badPath)).rejects.toThrow(ManifestFileNotFoundError);
  });

  it("includes absolute path in ManifestFileNotFoundError", async () => {
    const relativePath = join(tmpDir, "missing.yaml");
    try {
      await loadManifest(relativePath);
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestFileNotFoundError);
      const fnfErr = error as ManifestFileNotFoundError;
      expect(fnfErr.filePath).toBe(resolve(relativePath));
    }
  });

  it("interpolates env vars from file content", async () => {
    const filePath = join(tmpDir, "env.yaml");
    await writeFile(filePath, YAML_WITH_ENV_VARS, "utf-8");

    const manifest = await loadManifest(filePath, {
      env: { SLACK_BOT_TOKEN: "xoxb-test" },
    });
    expect(manifest.channels?.[0]?.config.token).toBe("xoxb-test");
  });

  it("supports custom encoding option", async () => {
    const filePath = join(tmpDir, "latin.yaml");
    await writeFile(filePath, VALID_MINIMAL_YAML, "utf-8");

    const manifest = await loadManifest(filePath, { encoding: "utf-8" });
    expect(manifest.name).toBe("test-agent");
  });

  it("throws ManifestSchemaError for empty file", async () => {
    const filePath = join(tmpDir, "empty.yaml");
    await writeFile(filePath, "", "utf-8");

    await expect(loadManifest(filePath, { skipInterpolation: true })).rejects.toThrow(
      ManifestSchemaError,
    );
  });

  it("result is deeply frozen", async () => {
    const filePath = join(tmpDir, "frozen.yaml");
    await writeFile(filePath, VALID_FULL_YAML, "utf-8");

    const manifest = await loadManifest(filePath, { skipInterpolation: true });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.model)).toBe(true);
  });
});
