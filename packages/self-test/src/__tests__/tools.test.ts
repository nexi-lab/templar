import { afterEach, describe, expect, it, vi } from "vitest";
import { SelfTestRunner } from "../runner.js";
import { createSelfTestTools } from "../tools.js";
import type { ResolvedSelfTestConfig } from "../types.js";
import { makeMockVerifier } from "./helpers.js";

function makeConfig(overrides?: Partial<ResolvedSelfTestConfig>): ResolvedSelfTestConfig {
  return {
    workspace: "/tmp/test",
    browser: {
      timeoutMs: 120_000,
      viewport: { width: 1280, height: 720 },
      screenshotOnFailure: true,
    },
    screenshots: {
      storage: "base64",
      directory: ".self-test/screenshots",
      onPass: "never",
      onFail: "always",
    },
    report: {
      outputPath: ".self-test/reports",
      includeScreenshots: true,
    },
    maxTotalDurationMs: 300_000,
    ...overrides,
  };
}

describe("createSelfTestTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create tools with all methods", () => {
    const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), null);

    expect(typeof tools.runPreflight).toBe("function");
    expect(typeof tools.runSmoke).toBe("function");
    expect(typeof tools.runApiTest).toBe("function");
    expect(typeof tools.runBrowserTest).toBe("function");
    expect(typeof tools.runFullSuite).toBe("function");
    expect(typeof tools.getLastReport).toBe("function");
  });

  describe("runPreflight", () => {
    it("should skip when no health config", async () => {
      const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), null);
      const result = await tools.runPreflight();
      expect(result.status).toBe("skipped");
    });

    it("should run health checks when configured", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

      const config = makeConfig({
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 5_000,
        },
      });

      const tools = createSelfTestTools(config, new SelfTestRunner(), null);
      const result = await tools.runPreflight();

      expect(result.status).toBe("passed");
      expect(result.verifierResults).toHaveLength(1);
    });

    it("should return failed result on health check failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const config = makeConfig({
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 200,
        },
      });

      const tools = createSelfTestTools(config, new SelfTestRunner(), null);
      const result = await tools.runPreflight();

      expect(result.status).toBe("failed");
    });
  });

  describe("runSmoke", () => {
    it("should run smoke steps", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

      const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), null);
      const result = await tools.runSmoke([{ action: "navigate", url: "http://localhost:3000" }]);

      expect(result.status).toBe("passed");
    });
  });

  describe("runApiTest", () => {
    it("should run API test steps", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), null);
      const result = await tools.runApiTest({
        baseUrl: "http://localhost:3000",
        steps: [{ method: "GET", path: "/api/health", expectedStatus: 200 }],
      });

      expect(result.status).toBe("passed");
    });
  });

  describe("runFullSuite", () => {
    it("should run full pipeline and store report", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({ name: "health", phase: "preflight" }),
      );

      const tools = createSelfTestTools(makeConfig(), runner, null);
      const report = await tools.runFullSuite();

      expect(report.phases.preflight.status).toBe("passed");
      expect(tools.getLastReport()).toBe(report);
    });
  });

  describe("getLastReport", () => {
    it("should return initial report if no runs", () => {
      const initialReport = {
        results: {
          tool: { name: "@templar/self-test" as const, version: "0.0.0" },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            pending: 0,
            skipped: 0,
            other: 0,
            start: 0,
            stop: 0,
          },
          tests: [],
        },
        phases: {
          preflight: { status: "passed" as const, durationMs: 0, verifierResults: [] },
          smoke: { status: "skipped" as const, durationMs: 0, verifierResults: [] },
          verification: { status: "skipped" as const, durationMs: 0, verifierResults: [] },
        },
      };

      const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), initialReport);
      expect(tools.getLastReport()).toBe(initialReport);
    });

    it("should return null when no initial report", () => {
      const tools = createSelfTestTools(makeConfig(), new SelfTestRunner(), null);
      expect(tools.getLastReport()).toBeNull();
    });
  });
});
