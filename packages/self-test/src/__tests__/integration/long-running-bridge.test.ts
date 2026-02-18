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
      if (req.url === "/api/features") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ features: ["auth", "dashboard"] }));
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

describe("Self-test + Long-running bridge", () => {
  it("should produce a report suitable as testEvidence for LongRunningMiddleware", async () => {
    const baseUrl = `http://localhost:${port}`;

    // 1. Set up self-test middleware
    const selfTestMiddleware = new SelfTestMiddleware({
      workspace: "/tmp/bridge-test",
      health: {
        checks: [{ name: "api", url: `${baseUrl}/health` }],
      },
      api: { baseUrl },
    });

    // 2. Start self-test session
    await selfTestMiddleware.onSessionStart({ sessionId: "bridge-test" });

    // 3. Run API test to verify a feature
    const tools = selfTestMiddleware.getTools();
    const apiResult = await tools.runApiTest({
      baseUrl,
      steps: [{ method: "GET", path: "/api/features", expectedStatus: 200 }],
    });

    expect(apiResult.status).toBe("passed");

    // 4. Run full suite to get a complete report
    const report = await tools.runFullSuite();

    // 5. The report can be serialized as testEvidence for LongRunningMiddleware
    const testEvidence = JSON.stringify(report);
    const parsed = JSON.parse(testEvidence) as Record<string, unknown>;

    expect(parsed).toHaveProperty("results");
    expect(parsed).toHaveProperty("phases");

    // Verify the evidence contains meaningful data
    const results = parsed.results as Record<string, unknown>;
    const summary = results.summary as Record<string, unknown>;
    expect(typeof summary.tests).toBe("number");
    expect(typeof summary.passed).toBe("number");

    // This is what an agent would pass to:
    // longRunningTools.updateFeatureStatus({
    //   featureId: "some-feature",
    //   testEvidence: JSON.stringify(report),
    // })

    // 6. Cleanup
    await selfTestMiddleware.onSessionEnd({ sessionId: "bridge-test" });
  });

  it("should produce structured CTRF evidence even on partial failure", async () => {
    const baseUrl = `http://localhost:${port}`;

    const selfTestMiddleware = new SelfTestMiddleware({
      workspace: "/tmp/bridge-test-2",
      health: {
        checks: [{ name: "api", url: `${baseUrl}/health` }],
      },
    });

    await selfTestMiddleware.onSessionStart({ sessionId: "bridge-test-2" });

    // Test a non-existent endpoint
    const tools = selfTestMiddleware.getTools();
    const apiResult = await tools.runApiTest({
      baseUrl,
      steps: [{ method: "GET", path: "/api/nonexistent", expectedStatus: 200 }],
    });

    expect(apiResult.status).toBe("failed");
    expect(apiResult.assertions[0]?.passed).toBe(false);

    // The failed result is still serializable as evidence
    const evidence = JSON.stringify(apiResult);
    expect(evidence).toContain("failed");

    await selfTestMiddleware.onSessionEnd({ sessionId: "bridge-test-2" });
  });
});
