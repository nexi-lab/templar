import { ManifestInterpolationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { interpolateEnvVars } from "../../interpolation.js";

describe("interpolateEnvVars", () => {
  it("replaces ${VAR} with the env value", () => {
    const result = interpolateEnvVars("hello ${NAME}", { NAME: "world" });
    expect(result).toBe("hello world");
  });

  it("replaces ${VAR:default} with the env value when set", () => {
    const result = interpolateEnvVars("${REGION:us-west-1}", { REGION: "eu-central-1" });
    expect(result).toBe("eu-central-1");
  });

  it("uses default value when var is missing", () => {
    const result = interpolateEnvVars("${REGION:us-east-1}", {});
    expect(result).toBe("us-east-1");
  });

  it("uses empty string as default with ${VAR:}", () => {
    const result = interpolateEnvVars("prefix${OPT:}suffix", {});
    expect(result).toBe("prefixsuffix");
  });

  it("replaces multiple vars in one string", () => {
    const result = interpolateEnvVars("${A}-${B}", { A: "hello", B: "world" });
    expect(result).toBe("hello-world");
  });

  it("throws ManifestInterpolationError for missing var without default", () => {
    expect(() => interpolateEnvVars("${MISSING}")).toThrow(ManifestInterpolationError);
  });

  it("reports all missing vars in one error", () => {
    try {
      interpolateEnvVars("${X} and ${Y} and ${Z}", {});
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestInterpolationError);
      expect((error as ManifestInterpolationError).missingVars).toEqual(["X", "Y", "Z"]);
    }
  });

  it("returns string unchanged when no markers present", () => {
    const input = "no variables here";
    expect(interpolateEnvVars(input, {})).toBe(input);
  });

  it("accepts a custom env map", () => {
    const env = { CUSTOM: "value" };
    expect(interpolateEnvVars("${CUSTOM}", env)).toBe("value");
  });

  it("does not recursively expand values containing ${", () => {
    const result = interpolateEnvVars("${VAR}", { VAR: "${NESTED}" });
    expect(result).toBe("${NESTED}");
  });

  it("treats empty string env value as valid (not missing)", () => {
    const result = interpolateEnvVars("${EMPTY}", { EMPTY: "" });
    expect(result).toBe("");
  });

  it("handles default with special chars like URL", () => {
    const result = interpolateEnvVars("${URL:http://localhost}", {});
    expect(result).toBe("http://localhost");
  });

  it("handles var names with hyphens", () => {
    const result = interpolateEnvVars("${MY-VAR}", { "MY-VAR": "ok" });
    expect(result).toBe("ok");
  });

  it("handles var names with numbers", () => {
    const result = interpolateEnvVars("${MY_VAR_123}", { MY_VAR_123: "num" });
    expect(result).toBe("num");
  });

  it("defaults to process.env when no env provided", () => {
    const key = `__TEMPLAR_TEST_${Date.now()}__`;
    process.env[key] = "from-process";
    try {
      const result = interpolateEnvVars(`\${${key}}`);
      expect(result).toBe("from-process");
    } finally {
      delete process.env[key];
    }
  });
});
