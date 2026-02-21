import { describe, expect, it } from "vitest";
import { sanitizeEnv } from "../../sanitizer.js";

describe("sanitizeEnv", () => {
  it("should strip matching env vars", () => {
    const env = {
      PATH: "/usr/bin",
      API_KEY: "secret-123",
      HOME: "/home/user",
    };
    const result = sanitizeEnv(env, ["*API_KEY*"]);
    expect(result.env).not.toHaveProperty("API_KEY");
    expect(result.env).toHaveProperty("PATH");
    expect(result.env).toHaveProperty("HOME");
    expect(result.strippedKeys).toEqual(["API_KEY"]);
  });

  it("should preserve non-sensitive vars", () => {
    const env = {
      PATH: "/usr/bin",
      HOME: "/home/user",
      EDITOR: "vim",
    };
    const result = sanitizeEnv(env, ["*SECRET*", "*TOKEN*"]);
    expect(Object.keys(result.env)).toHaveLength(3);
    expect(result.strippedKeys).toHaveLength(0);
  });

  it("should report stripped keys", () => {
    const env = {
      GITHUB_TOKEN: "ghp_xxx",
      AWS_SECRET_ACCESS_KEY: "aws-key",
      PATH: "/usr/bin",
    };
    const result = sanitizeEnv(env, ["*TOKEN*", "*SECRET*"]);
    expect(result.strippedKeys).toContain("GITHUB_TOKEN");
    expect(result.strippedKeys).toContain("AWS_SECRET_ACCESS_KEY");
    expect(result.strippedKeys).toHaveLength(2);
  });

  it("should handle custom patterns", () => {
    const env = {
      MY_CUSTOM_KEY: "value",
      OTHER_VAR: "ok",
    };
    const result = sanitizeEnv(env, ["MY_CUSTOM_*"]);
    expect(result.env).not.toHaveProperty("MY_CUSTOM_KEY");
    expect(result.env).toHaveProperty("OTHER_VAR");
  });

  it("should handle empty env", () => {
    const result = sanitizeEnv({}, ["*SECRET*"]);
    expect(Object.keys(result.env)).toHaveLength(0);
    expect(result.strippedKeys).toHaveLength(0);
  });

  it("should be case-insensitive for pattern matching", () => {
    const env = {
      api_key: "lower",
      API_KEY: "upper",
    };
    const result = sanitizeEnv(env, ["*API_KEY*"]);
    expect(result.strippedKeys).toContain("api_key");
    expect(result.strippedKeys).toContain("API_KEY");
  });
});
