import type { CTRFTest, PhaseResult, SelfTestReport, VerifierResult } from "./types.js";

const PACKAGE_VERSION = "0.0.0";

function verifierResultToStatus(status: VerifierResult["status"]): CTRFTest["status"] {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "error":
      return "other";
  }
}

function verifierResultToCTRFTest(result: VerifierResult): CTRFTest {
  const screenshotExtra =
    result.screenshots.length > 0
      ? {
          screenshots: result.screenshots.map((s) => ({
            name: s.name,
            base64: s.base64,
            timestamp: s.timestamp,
          })),
        }
      : {};

  return {
    name: result.verifierName,
    status: verifierResultToStatus(result.status),
    duration: result.durationMs,
    ...(result.error ? { message: result.error.message, trace: result.error.stack } : {}),
    ...(Object.keys(screenshotExtra).length > 0 ? { extra: screenshotExtra } : {}),
  };
}

/**
 * ReportBuilder — constructs CTRF-compatible JSON reports from phase results.
 */
export class ReportBuilder {
  /**
   * Build a full SelfTestReport from phase results.
   */
  static build(
    preflight: PhaseResult,
    smoke: PhaseResult,
    verification: PhaseResult,
    startTime: number,
  ): SelfTestReport {
    const stopTime = Date.now();

    // Collect all verifier results across phases
    const allResults = [
      ...preflight.verifierResults,
      ...smoke.verifierResults,
      ...verification.verifierResults,
    ];

    // Convert to CTRF tests
    const tests = allResults.map(verifierResultToCTRFTest);

    // Count statuses
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let pending = 0;
    let other = 0;

    for (const test of tests) {
      switch (test.status) {
        case "passed":
          passed++;
          break;
        case "failed":
          failed++;
          break;
        case "skipped":
          skipped++;
          break;
        case "pending":
          pending++;
          break;
        case "other":
          other++;
          break;
      }
    }

    return {
      results: {
        tool: { name: "@templar/self-test", version: PACKAGE_VERSION },
        summary: {
          tests: tests.length,
          passed,
          failed,
          pending,
          skipped,
          other,
          start: startTime,
          stop: stopTime,
        },
        tests,
      },
      phases: {
        preflight,
        smoke,
        verification,
      },
    };
  }
}
