import type { SelfTestRunner } from "./runner.js";
import type {
  ApiTestConfig,
  BrowserStep,
  PhaseResult,
  ResolvedSelfTestConfig,
  SelfTestReport,
  SelfTestTools,
  SmokeStep,
  VerifierContext,
  VerifierResult,
} from "./types.js";
import { ApiVerifier } from "./verifiers/api.js";
import { BrowserVerifier } from "./verifiers/browser.js";
import { HealthVerifier } from "./verifiers/health.js";
import { SmokeVerifier } from "./verifiers/smoke.js";

/**
 * Create SelfTestTools — factory function for agent-callable verification tools.
 *
 * These tools allow the agent to trigger verification on demand during
 * a session, outside the automatic middleware gates.
 */
export function createSelfTestTools(
  config: ResolvedSelfTestConfig,
  runner: SelfTestRunner,
  initialReport: SelfTestReport | null,
): SelfTestTools {
  let lastReport: SelfTestReport | null = initialReport;

  function makeContext(): VerifierContext {
    return {
      workspace: config.workspace,
      ...(config.api ? { baseUrl: config.api.baseUrl } : {}),
    };
  }

  async function runPreflight(): Promise<PhaseResult> {
    if (!config.health) {
      return { status: "skipped", durationMs: 0, verifierResults: [] };
    }
    const verifier = new HealthVerifier(config.health);
    const context = makeContext();
    const start = Date.now();

    try {
      const result = await verifier.run(context);
      return {
        status: result.status === "passed" ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifierResults: [result],
      };
    } catch (err) {
      return {
        status: "failed",
        durationMs: Date.now() - start,
        verifierResults: [
          {
            verifierName: verifier.name,
            phase: "preflight",
            status: "error",
            durationMs: Date.now() - start,
            assertions: [],
            screenshots: [],
            error: err instanceof Error ? err : new Error(String(err)),
          },
        ],
      };
    }
  }

  async function runSmoke(steps: readonly SmokeStep[]): Promise<PhaseResult> {
    const verifier = new SmokeVerifier({ steps });
    const context = makeContext();
    const start = Date.now();

    const result = await verifier.run(context);
    return {
      status: result.status === "passed" ? "passed" : "failed",
      durationMs: Date.now() - start,
      verifierResults: [result],
    };
  }

  async function runApiTest(testConfig: ApiTestConfig): Promise<VerifierResult> {
    const verifier = new ApiVerifier(testConfig);
    const context = makeContext();
    return verifier.run(context);
  }

  async function runBrowserTest(steps: readonly BrowserStep[]): Promise<VerifierResult> {
    const verifier = new BrowserVerifier(steps, config.browser);
    const context = makeContext();
    return verifier.run(context);
  }

  async function runFullSuite(): Promise<SelfTestReport> {
    const context = makeContext();
    const report = await runner.run(context);
    lastReport = report;
    return report;
  }

  function getLastReport(): SelfTestReport | null {
    return lastReport;
  }

  return {
    runPreflight,
    runSmoke,
    runApiTest,
    runBrowserTest,
    runFullSuite,
    getLastReport,
  };
}
