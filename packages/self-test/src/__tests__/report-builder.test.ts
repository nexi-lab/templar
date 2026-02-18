import { describe, expect, it } from "vitest";
import { ReportBuilder } from "../report-builder.js";
import { makePhaseResult, makeScreenshotCapture, makeVerifierResult } from "./helpers.js";

describe("ReportBuilder", () => {
  it("should build a valid CTRF report from all phases", () => {
    const preflight = makePhaseResult({
      verifierResults: [
        makeVerifierResult({ verifierName: "health", phase: "preflight", status: "passed" }),
      ],
    });
    const smoke = makePhaseResult({
      verifierResults: [
        makeVerifierResult({ verifierName: "smoke", phase: "smoke", status: "passed" }),
      ],
    });
    const verification = makePhaseResult({
      verifierResults: [
        makeVerifierResult({ verifierName: "api", phase: "verification", status: "passed" }),
        makeVerifierResult({ verifierName: "browser", phase: "verification", status: "failed" }),
      ],
    });

    const report = ReportBuilder.build(preflight, smoke, verification, 1000);

    expect(report.results.tool.name).toBe("@templar/self-test");
    expect(report.results.summary.tests).toBe(4);
    expect(report.results.summary.passed).toBe(3);
    expect(report.results.summary.failed).toBe(1);
    expect(report.results.summary.skipped).toBe(0);
    expect(report.results.summary.pending).toBe(0);
    expect(report.results.summary.other).toBe(0);
    expect(report.results.summary.start).toBe(1000);
    expect(report.results.summary.stop).toBeGreaterThanOrEqual(1000);
    expect(report.results.tests).toHaveLength(4);
    expect(report.phases.preflight).toBe(preflight);
    expect(report.phases.smoke).toBe(smoke);
    expect(report.phases.verification).toBe(verification);
  });

  it("should count skipped tests", () => {
    const preflight = makePhaseResult({
      verifierResults: [makeVerifierResult({ status: "skipped" })],
    });

    const report = ReportBuilder.build(
      preflight,
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      0,
    );

    expect(report.results.summary.skipped).toBe(1);
  });

  it("should count error tests as 'other'", () => {
    const preflight = makePhaseResult({
      verifierResults: [makeVerifierResult({ status: "error", error: new Error("boom") })],
    });

    const report = ReportBuilder.build(
      preflight,
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      0,
    );

    expect(report.results.summary.other).toBe(1);
    expect(report.results.tests[0]?.status).toBe("other");
    expect(report.results.tests[0]?.message).toBe("boom");
  });

  it("should include error trace in CTRF test", () => {
    const err = new Error("test error");
    const result = makeVerifierResult({ status: "error", error: err });

    const report = ReportBuilder.build(
      makePhaseResult({ verifierResults: [result] }),
      makePhaseResult({ verifierResults: [] }),
      makePhaseResult({ verifierResults: [] }),
      0,
    );

    expect(report.results.tests[0]?.trace).toBe(err.stack);
  });

  it("should include screenshots in extra field", () => {
    const screenshot = makeScreenshotCapture({ name: "failure-0" });
    const result = makeVerifierResult({
      screenshots: [screenshot],
    });

    const report = ReportBuilder.build(
      makePhaseResult({ verifierResults: [result] }),
      makePhaseResult({ verifierResults: [] }),
      makePhaseResult({ verifierResults: [] }),
      0,
    );

    const extra = report.results.tests[0]?.extra;
    expect(extra).toBeDefined();
    expect((extra as Record<string, unknown>).screenshots).toBeDefined();
  });

  it("should handle empty report", () => {
    const report = ReportBuilder.build(
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      makePhaseResult({ status: "skipped", verifierResults: [] }),
      0,
    );

    expect(report.results.summary.tests).toBe(0);
    expect(report.results.tests).toHaveLength(0);
  });
});
