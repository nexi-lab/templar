import { SelfTestHealthCheckFailedError, SelfTestVerificationFailedError } from "@templar/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelfTestMiddleware } from "../middleware.js";

const sessionContext = { sessionId: "test-session-1" };

describe("SelfTestMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have correct name", () => {
    const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
    expect(middleware.name).toBe("templar:self-test");
  });

  it("should resolve config with defaults", () => {
    const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
    const config = middleware.getConfig();
    expect(config.maxTotalDurationMs).toBe(300_000);
    expect(config.browser.timeoutMs).toBe(120_000);
  });

  describe("onSessionStart", () => {
    it("should pass when no health or smoke config", async () => {
      const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
      await expect(middleware.onSessionStart(sessionContext)).resolves.toBeUndefined();
    });

    it("should pass when health checks succeed", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

      const middleware = new SelfTestMiddleware({
        workspace: "/tmp",
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 5_000,
        },
      });

      await expect(middleware.onSessionStart(sessionContext)).resolves.toBeUndefined();
    });

    it("should throw SelfTestHealthCheckFailedError when health fails", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const middleware = new SelfTestMiddleware({
        workspace: "/tmp",
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 200,
        },
      });

      await expect(middleware.onSessionStart(sessionContext)).rejects.toThrow(
        SelfTestHealthCheckFailedError,
      );
    });

    it("should throw SelfTestVerificationFailedError when smoke fails", async () => {
      // Health passes, smoke fails
      let _fetchCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        _fetchCount++;
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/health")) {
          return new Response("ok", { status: 200 });
        }
        return new Response("error", { status: 500 });
      });

      const middleware = new SelfTestMiddleware({
        workspace: "/tmp",
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 5_000,
        },
        smoke: {
          steps: [{ action: "navigate", url: "http://localhost:3000/app" }],
          timeoutMs: 5_000,
        },
      });

      await expect(middleware.onSessionStart(sessionContext)).rejects.toThrow(
        SelfTestVerificationFailedError,
      );
    });

    it("should make tools available after successful start", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

      const middleware = new SelfTestMiddleware({
        workspace: "/tmp",
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
          timeoutMs: 5_000,
        },
      });

      await middleware.onSessionStart(sessionContext);
      const tools = middleware.getTools();
      expect(tools).toBeDefined();
      expect(typeof tools.runPreflight).toBe("function");
      expect(typeof tools.runFullSuite).toBe("function");
    });

    it("should store last report", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

      const middleware = new SelfTestMiddleware({
        workspace: "/tmp",
        health: {
          checks: [{ name: "api", url: "http://localhost:3000/health" }],
        },
      });

      await middleware.onSessionStart(sessionContext);
      const report = middleware.getLastReport();
      expect(report).toBeDefined();
      expect(report?.phases.preflight.status).toBe("passed");
    });
  });

  describe("getTools", () => {
    it("should throw before onSessionStart", () => {
      const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
      expect(() => middleware.getTools()).toThrow("Call onSessionStart() first");
    });
  });

  describe("getLastReport", () => {
    it("should return null before onSessionStart", () => {
      const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
      expect(middleware.getLastReport()).toBeNull();
    });
  });

  describe("onSessionEnd", () => {
    it("should clean up tools", async () => {
      const middleware = new SelfTestMiddleware({ workspace: "/tmp" });
      await middleware.onSessionStart(sessionContext);
      await middleware.onSessionEnd(sessionContext);
      expect(() => middleware.getTools()).toThrow();
    });
  });
});
