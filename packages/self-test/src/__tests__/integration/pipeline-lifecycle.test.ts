import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SelfTestMiddleware } from "../../middleware.js";

let server: http.Server;
let port: number;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.url === "/api/data") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ items: [1, 2, 3] }));
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === "object" && addr !== null ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("Pipeline lifecycle integration", () => {
  it("should run full middleware lifecycle with real HTTP server", async () => {
    const baseUrl = `http://localhost:${port}`;

    const middleware = new SelfTestMiddleware({
      workspace: "/tmp/test-workspace",
      health: {
        checks: [{ name: "api-health", url: `${baseUrl}/health` }],
        timeoutMs: 5_000,
      },
      smoke: {
        steps: [{ action: "assertStatus", url: `${baseUrl}/health`, expectedStatus: 200 }],
        timeoutMs: 5_000,
      },
      api: { baseUrl },
    });

    // 1. onSessionStart should pass
    await middleware.onSessionStart({ sessionId: "integration-test-1" });

    // 2. Tools should be available
    const tools = middleware.getTools();
    expect(tools).toBeDefined();

    // 3. Run API test on demand
    const apiResult = await tools.runApiTest({
      baseUrl,
      steps: [
        { method: "GET", path: "/api/data", expectedStatus: 200 },
        { method: "GET", path: "/health", expectedStatus: 200 },
      ],
    });
    expect(apiResult.status).toBe("passed");
    expect(apiResult.assertions).toHaveLength(2);

    // 4. Run preflight on demand
    const preflightResult = await tools.runPreflight();
    expect(preflightResult.status).toBe("passed");

    // 5. Run smoke on demand
    const smokeResult = await tools.runSmoke([{ action: "navigate", url: `${baseUrl}/health` }]);
    expect(smokeResult.status).toBe("passed");

    // 6. Get last report from session start
    const report = middleware.getLastReport();
    expect(report).toBeDefined();
    expect(report?.phases.preflight.status).toBe("passed");
    expect(report?.phases.smoke.status).toBe("passed");
    expect(report?.results.tool.name).toBe("@templar/self-test");

    // 7. Full suite run
    const fullReport = await tools.runFullSuite();
    expect(fullReport.phases.preflight.status).toBe("passed");

    // 8. onSessionEnd should clean up
    await middleware.onSessionEnd({ sessionId: "integration-test-1" });
    expect(() => middleware.getTools()).toThrow();
  });

  it("should handle failed health check with real server returning 503", async () => {
    // Use a non-existent port
    const middleware = new SelfTestMiddleware({
      workspace: "/tmp/test",
      health: {
        checks: [{ name: "bad-check", url: "http://localhost:1/health" }],
        timeoutMs: 500,
      },
    });

    await expect(middleware.onSessionStart({ sessionId: "fail-test" })).rejects.toThrow();
  });

  it("should produce CTRF-compatible report structure", async () => {
    const baseUrl = `http://localhost:${port}`;

    const middleware = new SelfTestMiddleware({
      workspace: "/tmp/test",
      health: {
        checks: [{ name: "health", url: `${baseUrl}/health` }],
      },
    });

    await middleware.onSessionStart({ sessionId: "ctrf-test" });
    const report = middleware.getLastReport()!;

    // Validate CTRF structure
    expect(report.results).toHaveProperty("tool");
    expect(report.results).toHaveProperty("summary");
    expect(report.results).toHaveProperty("tests");
    expect(report.results.summary).toHaveProperty("tests");
    expect(report.results.summary).toHaveProperty("passed");
    expect(report.results.summary).toHaveProperty("failed");
    expect(report.results.summary).toHaveProperty("start");
    expect(report.results.summary).toHaveProperty("stop");
    expect(report.phases).toHaveProperty("preflight");
    expect(report.phases).toHaveProperty("smoke");
    expect(report.phases).toHaveProperty("verification");

    await middleware.onSessionEnd({ sessionId: "ctrf-test" });
  });
});
