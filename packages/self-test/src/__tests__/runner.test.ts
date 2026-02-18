import { describe, expect, it, vi } from "vitest";
import { SelfTestRunner } from "../runner.js";
import { makeMockVerifier, makeVerifierContext, makeVerifierResult } from "./helpers.js";

describe("SelfTestRunner", () => {
  describe("happy path", () => {
    it("should run all phases and produce a report", async () => {
      const runner = new SelfTestRunner()
        .addVerifier(makeMockVerifier({ name: "health", phase: "preflight" }))
        .addVerifier(makeMockVerifier({ name: "smoke", phase: "smoke" }))
        .addVerifier(makeMockVerifier({ name: "api", phase: "verification" }));

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("passed");
      expect(report.phases.smoke.status).toBe("passed");
      expect(report.phases.verification.status).toBe("passed");
      expect(report.results.summary.tests).toBe(3);
      expect(report.results.summary.passed).toBe(3);
      expect(report.results.summary.failed).toBe(0);
    });
  });

  describe("gating", () => {
    it("should skip smoke + verification when preflight fails", async () => {
      const runner = new SelfTestRunner()
        .addVerifier(
          makeMockVerifier({
            name: "health",
            phase: "preflight",
            result: { status: "failed" },
          }),
        )
        .addVerifier(makeMockVerifier({ name: "smoke", phase: "smoke" }))
        .addVerifier(makeMockVerifier({ name: "api", phase: "verification" }));

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("failed");
      expect(report.phases.smoke.status).toBe("skipped");
      expect(report.phases.verification.status).toBe("skipped");
      expect(report.results.summary.tests).toBe(1);
      expect(report.results.summary.failed).toBe(1);
    });

    it("should skip verification when smoke fails", async () => {
      const runner = new SelfTestRunner()
        .addVerifier(makeMockVerifier({ name: "health", phase: "preflight" }))
        .addVerifier(
          makeMockVerifier({
            name: "smoke",
            phase: "smoke",
            result: { status: "failed" },
          }),
        )
        .addVerifier(makeMockVerifier({ name: "api", phase: "verification" }));

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("passed");
      expect(report.phases.smoke.status).toBe("failed");
      expect(report.phases.verification.status).toBe("skipped");
    });
  });

  describe("partial verification failure", () => {
    it("should collect all results when verification partially fails", async () => {
      const runner = new SelfTestRunner()
        .addVerifier(makeMockVerifier({ name: "health", phase: "preflight" }))
        .addVerifier(makeMockVerifier({ name: "smoke", phase: "smoke" }))
        .addVerifier(makeMockVerifier({ name: "api", phase: "verification" }))
        .addVerifier(
          makeMockVerifier({
            name: "browser",
            phase: "verification",
            result: { status: "failed" },
          }),
        );

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("passed");
      expect(report.phases.smoke.status).toBe("passed");
      expect(report.phases.verification.status).toBe("failed");
      // Both verification verifiers should have results
      expect(report.phases.verification.verifierResults).toHaveLength(2);
      expect(report.results.summary.tests).toBe(4);
    });
  });

  describe("empty phases", () => {
    it("should skip phases with no verifiers", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({ name: "api", phase: "verification" }),
      );

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("skipped");
      expect(report.phases.smoke.status).toBe("skipped");
      expect(report.phases.verification.status).toBe("passed");
      expect(report.results.summary.tests).toBe(1);
    });

    it("should produce empty report with no verifiers", async () => {
      const runner = new SelfTestRunner();
      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("skipped");
      expect(report.phases.smoke.status).toBe("skipped");
      expect(report.phases.verification.status).toBe("skipped");
      expect(report.results.summary.tests).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle verifier throwing an error", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({
          name: "broken",
          phase: "preflight",
          runFn: async () => {
            throw new Error("verifier exploded");
          },
        }),
      );

      const report = await runner.run(makeVerifierContext());

      expect(report.phases.preflight.status).toBe("failed");
      expect(report.phases.preflight.verifierResults[0]?.status).toBe("error");
      expect(report.phases.preflight.verifierResults[0]?.error?.message).toBe("verifier exploded");
    });

    it("should call teardown even on run error", async () => {
      const teardownFn = vi.fn().mockResolvedValue(undefined);
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({
          name: "broken",
          phase: "preflight",
          runFn: async () => {
            throw new Error("boom");
          },
          teardownFn,
        }),
      );

      await runner.run(makeVerifierContext());
      expect(teardownFn).toHaveBeenCalled();
    });

    it("should call setup before run", async () => {
      const callOrder: string[] = [];
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({
          name: "setup-test",
          phase: "preflight",
          setupFn: async () => {
            callOrder.push("setup");
          },
          runFn: async () => {
            callOrder.push("run");
            return makeVerifierResult({ verifierName: "setup-test", phase: "preflight" });
          },
          teardownFn: async () => {
            callOrder.push("teardown");
          },
        }),
      );

      await runner.run(makeVerifierContext());
      expect(callOrder).toEqual(["setup", "run", "teardown"]);
    });
  });

  describe("immutability", () => {
    it("should return new instance on addVerifier", () => {
      const original = new SelfTestRunner();
      const withVerifier = original.addVerifier(
        makeMockVerifier({ name: "health", phase: "preflight" }),
      );

      expect(withVerifier).not.toBe(original);
    });

    it("should not modify original runner", async () => {
      const original = new SelfTestRunner();
      original.addVerifier(makeMockVerifier({ name: "health", phase: "preflight" }));

      const report = await original.run(makeVerifierContext());
      // Original has no verifiers
      expect(report.results.summary.tests).toBe(0);
    });
  });

  describe("last report", () => {
    it("should return null before any run", () => {
      const runner = new SelfTestRunner();
      expect(runner.getLastReport()).toBeNull();
    });

    it("should store last report after run", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({ name: "health", phase: "preflight" }),
      );

      const report = await runner.run(makeVerifierContext());
      expect(runner.getLastReport()).toBe(report);
    });
  });

  describe("abort signal", () => {
    it("should handle abort signal during execution", async () => {
      const controller = new AbortController();

      const runner = new SelfTestRunner()
        .addVerifier(
          makeMockVerifier({
            name: "slow",
            phase: "preflight",
            runFn: async () => {
              controller.abort();
              return makeVerifierResult({
                verifierName: "slow",
                phase: "preflight",
                status: "passed",
              });
            },
          }),
        )
        .addVerifier(makeMockVerifier({ name: "next", phase: "preflight" }));

      const report = await runner.run(makeVerifierContext({ abortSignal: controller.signal }));

      // First verifier passes, second should be skipped
      expect(report.phases.preflight.verifierResults).toHaveLength(2);
    });
  });

  describe("CTRF report format", () => {
    it("should include tool metadata", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({ name: "health", phase: "preflight" }),
      );

      const report = await runner.run(makeVerifierContext());

      expect(report.results.tool.name).toBe("@templar/self-test");
      expect(report.results.summary.start).toBeGreaterThan(0);
      expect(report.results.summary.stop).toBeGreaterThanOrEqual(report.results.summary.start);
    });

    it("should include tests in CTRF format", async () => {
      const runner = new SelfTestRunner().addVerifier(
        makeMockVerifier({ name: "health", phase: "preflight" }),
      );

      const report = await runner.run(makeVerifierContext());

      expect(report.results.tests).toHaveLength(1);
      expect(report.results.tests[0]?.name).toBe("health");
      expect(report.results.tests[0]?.status).toBe("passed");
      expect(typeof report.results.tests[0]?.duration).toBe("number");
    });
  });
});
