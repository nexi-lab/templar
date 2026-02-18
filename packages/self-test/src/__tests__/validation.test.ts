import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { resolveSelfTestConfig, validateSelfTestConfig } from "../validation.js";

describe("validateSelfTestConfig", () => {
  const validConfig = {
    workspace: "/tmp/workspace",
  };

  it("should accept minimal config with just workspace", () => {
    const result = validateSelfTestConfig(validConfig);
    expect(result.workspace).toBe("/tmp/workspace");
  });

  it("should accept full config", () => {
    const result = validateSelfTestConfig({
      workspace: "/tmp/workspace",
      devServer: {
        command: "npm start",
        url: "http://localhost:3000",
        timeoutMs: 10_000,
        env: { NODE_ENV: "test" },
        reuseExisting: false,
      },
      health: {
        checks: [{ name: "api", url: "http://localhost:3000/health" }],
        timeoutMs: 5_000,
      },
      smoke: {
        steps: [{ action: "navigate", url: "http://localhost:3000" }],
        timeoutMs: 15_000,
      },
      browser: {
        timeoutMs: 60_000,
        viewport: { width: 1920, height: 1080 },
        screenshotOnFailure: true,
      },
      api: {
        baseUrl: "http://localhost:3000",
        timeoutMs: 10_000,
      },
      screenshots: {
        storage: "disk",
        directory: ".test-screenshots",
        onPass: "always",
        onFail: "always",
      },
      report: {
        outputPath: ".test-reports",
        includeScreenshots: false,
      },
      maxTotalDurationMs: 120_000,
    });

    expect(result.workspace).toBe("/tmp/workspace");
    expect(result.devServer?.command).toBe("npm start");
    expect(result.health?.checks).toHaveLength(1);
    expect(result.smoke?.steps).toHaveLength(1);
    expect(result.browser?.viewport?.width).toBe(1920);
    expect(result.api?.baseUrl).toBe("http://localhost:3000");
    expect(result.screenshots?.storage).toBe("disk");
    expect(result.report?.includeScreenshots).toBe(false);
    expect(result.maxTotalDurationMs).toBe(120_000);
  });

  it("should reject empty workspace", () => {
    expect(() => validateSelfTestConfig({ workspace: "" })).toThrow(ZodError);
  });

  it("should reject missing workspace", () => {
    expect(() => validateSelfTestConfig({})).toThrow(ZodError);
  });

  it("should reject invalid devServer url", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        devServer: { command: "npm start", url: "not-a-url" },
      }),
    ).toThrow(ZodError);
  });

  it("should reject empty devServer command", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        devServer: { command: "", url: "http://localhost:3000" },
      }),
    ).toThrow(ZodError);
  });

  it("should reject devServer timeoutMs exceeding max", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        devServer: { command: "npm start", url: "http://localhost:3000", timeoutMs: 200_000 },
      }),
    ).toThrow(ZodError);
  });

  it("should reject empty health checks array", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        health: { checks: [] },
      }),
    ).toThrow(ZodError);
  });

  it("should reject invalid health check url", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        health: { checks: [{ name: "api", url: "bad-url" }] },
      }),
    ).toThrow(ZodError);
  });

  it("should reject empty smoke steps array", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        smoke: { steps: [] },
      }),
    ).toThrow(ZodError);
  });

  it("should reject invalid smoke step action", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        smoke: { steps: [{ action: "invalid" }] },
      }),
    ).toThrow(ZodError);
  });

  it("should reject invalid api baseUrl", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        api: { baseUrl: "not-a-url" },
      }),
    ).toThrow(ZodError);
  });

  it("should reject maxTotalDurationMs exceeding 10 min", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        maxTotalDurationMs: 700_000,
      }),
    ).toThrow(ZodError);
  });

  it("should reject negative maxTotalDurationMs", () => {
    expect(() =>
      validateSelfTestConfig({
        workspace: "/tmp",
        maxTotalDurationMs: -1,
      }),
    ).toThrow(ZodError);
  });
});

describe("resolveSelfTestConfig", () => {
  it("should apply all defaults for minimal config", () => {
    const validated = validateSelfTestConfig({ workspace: "/tmp/workspace" });
    const resolved = resolveSelfTestConfig(validated);

    expect(resolved.workspace).toBe("/tmp/workspace");
    expect(resolved.maxTotalDurationMs).toBe(300_000);
    expect(resolved.browser).toEqual({
      timeoutMs: 120_000,
      viewport: { width: 1280, height: 720 },
      screenshotOnFailure: true,
    });
    expect(resolved.screenshots).toEqual({
      storage: "base64",
      directory: ".self-test/screenshots",
      onPass: "never",
      onFail: "always",
    });
    expect(resolved.report).toEqual({
      outputPath: ".self-test/reports",
      includeScreenshots: true,
    });
    expect(resolved.devServer).toBeUndefined();
    expect(resolved.health).toBeUndefined();
    expect(resolved.smoke).toBeUndefined();
    expect(resolved.api).toBeUndefined();
  });

  it("should resolve devServer defaults", () => {
    const validated = validateSelfTestConfig({
      workspace: "/tmp",
      devServer: { command: "npm start", url: "http://localhost:3000" },
    });
    const resolved = resolveSelfTestConfig(validated);

    expect(resolved.devServer).toBeDefined();
    expect(resolved.devServer?.timeoutMs).toBe(30_000);
    expect(resolved.devServer?.reuseExisting).toBe(true);
    expect(resolved.devServer?.env).toEqual({});
  });

  it("should preserve user-provided overrides", () => {
    const validated = validateSelfTestConfig({
      workspace: "/tmp",
      browser: { timeoutMs: 60_000, viewport: { width: 1920, height: 1080 } },
      screenshots: { storage: "disk", directory: "custom-dir" },
      report: { outputPath: "custom-reports", includeScreenshots: false },
      maxTotalDurationMs: 120_000,
    });
    const resolved = resolveSelfTestConfig(validated);

    expect(resolved.browser.timeoutMs).toBe(60_000);
    expect(resolved.browser.viewport).toEqual({ width: 1920, height: 1080 });
    expect(resolved.browser.screenshotOnFailure).toBe(true); // default
    expect(resolved.screenshots.storage).toBe("disk");
    expect(resolved.screenshots.directory).toBe("custom-dir");
    expect(resolved.screenshots.onPass).toBe("never"); // default
    expect(resolved.screenshots.onFail).toBe("always"); // default
    expect(resolved.report.outputPath).toBe("custom-reports");
    expect(resolved.report.includeScreenshots).toBe(false);
    expect(resolved.maxTotalDurationMs).toBe(120_000);
  });

  it("should pass through health config unchanged", () => {
    const validated = validateSelfTestConfig({
      workspace: "/tmp",
      health: {
        checks: [{ name: "api", url: "http://localhost:3000/health", expectedStatus: 200 }],
        timeoutMs: 10_000,
      },
    });
    const resolved = resolveSelfTestConfig(validated);

    expect(resolved.health?.checks).toHaveLength(1);
    expect(resolved.health?.timeoutMs).toBe(10_000);
  });
});
