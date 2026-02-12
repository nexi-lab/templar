import { ManifestParseError, ManifestSchemaError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { parseManifestYaml } from "../../parser.js";
import {
  INVALID_SCHEMA_YAML,
  INVALID_YAML_SYNTAX,
  VALID_FULL_YAML,
  VALID_MINIMAL_YAML,
  YAML_WITH_ENV_VARS,
} from "../helpers/fixtures.js";

describe("parseManifestYaml", () => {
  it("parses valid YAML into a typed AgentManifest", () => {
    const manifest = parseManifestYaml(VALID_MINIMAL_YAML, { skipInterpolation: true });
    expect(manifest.name).toBe("test-agent");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.description).toBe("A test agent");
  });

  it("parses a full manifest with all fields", () => {
    const manifest = parseManifestYaml(VALID_FULL_YAML, { skipInterpolation: true });
    expect(manifest.name).toBe("research-agent");
    expect(manifest.model?.provider).toBe("anthropic");
    expect(manifest.tools).toHaveLength(2);
    expect(manifest.channels).toHaveLength(1);
    expect(manifest.middleware).toHaveLength(2);
    expect(manifest.permissions?.allowed).toEqual(["web_search", "file_read"]);
    expect(manifest.permissions?.denied).toEqual(["file_write"]);
  });

  it("returns a deeply frozen result", () => {
    const manifest = parseManifestYaml(VALID_FULL_YAML, { skipInterpolation: true });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.model)).toBe(true);
    expect(Object.isFrozen(manifest.tools)).toBe(true);
  });

  it("throws ManifestParseError for invalid YAML syntax", () => {
    expect(() => parseManifestYaml(INVALID_YAML_SYNTAX, { skipInterpolation: true })).toThrow(
      ManifestParseError,
    );
  });

  it("includes line/column in ManifestParseError", () => {
    try {
      parseManifestYaml(INVALID_YAML_SYNTAX, { skipInterpolation: true });
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestParseError);
      const parseErr = error as ManifestParseError;
      expect(parseErr.line).toBeTypeOf("number");
    }
  });

  it("throws ManifestSchemaError for valid YAML with invalid schema", () => {
    expect(() => parseManifestYaml(INVALID_SCHEMA_YAML, { skipInterpolation: true })).toThrow(
      ManifestSchemaError,
    );
  });

  it("includes issue list in ManifestSchemaError", () => {
    try {
      parseManifestYaml(INVALID_SCHEMA_YAML, { skipInterpolation: true });
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestSchemaError);
      expect((error as ManifestSchemaError).issues.length).toBeGreaterThan(0);
    }
  });

  it("interpolates env vars by default", () => {
    const manifest = parseManifestYaml(YAML_WITH_ENV_VARS, {
      env: { SLACK_BOT_TOKEN: "xoxb-secret" },
    });
    expect(manifest.channels?.[0]?.config.token).toBe("xoxb-secret");
    expect(manifest.channels?.[0]?.config.region).toBe("us-east-1");
  });

  it("skips interpolation when skipInterpolation is true", () => {
    const manifest = parseManifestYaml(YAML_WITH_ENV_VARS, { skipInterpolation: true });
    expect(manifest.channels?.[0]?.config.token).toBe("${SLACK_BOT_TOKEN}");
  });

  it("accepts YAML with comments", () => {
    const yaml = `
# This is a comment
name: commented
version: 1.0.0
description: Has comments # inline too
`;
    const manifest = parseManifestYaml(yaml, { skipInterpolation: true });
    expect(manifest.name).toBe("commented");
  });

  it("throws ManifestSchemaError for empty YAML string", () => {
    expect(() => parseManifestYaml("", { skipInterpolation: true })).toThrow(ManifestSchemaError);
  });

  it("throws ManifestSchemaError for YAML that parses to a non-object", () => {
    expect(() => parseManifestYaml("- item1\n- item2", { skipInterpolation: true })).toThrow(
      ManifestSchemaError,
    );
    expect(() => parseManifestYaml('"just a string"', { skipInterpolation: true })).toThrow(
      ManifestSchemaError,
    );
  });
});
