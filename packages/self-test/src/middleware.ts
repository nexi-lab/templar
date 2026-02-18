import type { SessionContext, TemplarMiddleware } from "@templar/core";
import { SelfTestHealthCheckFailedError, SelfTestVerificationFailedError } from "@templar/errors";
import { ProcessManager } from "./process-manager.js";
import { SelfTestRunner } from "./runner.js";
import { createSelfTestTools } from "./tools.js";
import type {
  ResolvedSelfTestConfig,
  SelfTestConfig,
  SelfTestReport,
  SelfTestTools,
  VerifierContext,
} from "./types.js";
import { resolveSelfTestConfig, validateSelfTestConfig } from "./validation.js";
import { HealthVerifier } from "./verifiers/health.js";
import { SmokeVerifier } from "./verifiers/smoke.js";

/**
 * SelfTestMiddleware — gate middleware for session-level self-verification.
 *
 * Implements TemplarMiddleware to run health checks and smoke tests
 * at session start, blocking the session if verification fails.
 *
 * Usage:
 *   const middleware = new SelfTestMiddleware({ workspace: "/app", ... });
 *   // Register with Templar engine
 *
 * On session start:
 *   1. Start dev server if configured
 *   2. Run preflight (health checks)
 *   3. Run smoke tests
 *   4. If either fails, throw — session is blocked
 *   5. Expose tools for on-demand verification
 *
 * On session end:
 *   1. Stop dev server
 */
export class SelfTestMiddleware implements TemplarMiddleware {
  readonly name = "templar:self-test";

  private readonly config: ResolvedSelfTestConfig;
  private readonly runner: SelfTestRunner;
  private readonly processManager: ProcessManager;
  private tools: SelfTestTools | null = null;
  private lastReport: SelfTestReport | null = null;

  constructor(config: SelfTestConfig) {
    this.config = resolveSelfTestConfig(validateSelfTestConfig(config));
    this.processManager = new ProcessManager();

    // Build runner from config
    let runner = new SelfTestRunner();

    // Register health verifier if configured
    if (this.config.health) {
      runner = runner.addVerifier(new HealthVerifier(this.config.health));
    }

    // Register smoke verifier if configured
    if (this.config.smoke) {
      runner = runner.addVerifier(new SmokeVerifier(this.config.smoke));
    }

    this.runner = runner;
  }

  async onSessionStart(_context: SessionContext): Promise<void> {
    // 1. Start dev server if configured
    if (this.config.devServer) {
      await this.processManager.start(this.config.devServer);
    }

    // Build verifier context
    const verifierContext: VerifierContext = {
      workspace: this.config.workspace,
      ...(this.config.api ? { baseUrl: this.config.api.baseUrl } : {}),
      ...(_context.sessionId ? { sessionId: _context.sessionId } : {}),
    };

    // 2. Run preflight + smoke via runner
    const report = await this.runner.run(verifierContext);
    this.lastReport = report;

    // 3. Gate: throw if preflight or smoke failed
    if (report.phases.preflight.status === "failed") {
      const failedResults = report.phases.preflight.verifierResults.filter(
        (r) => r.status === "failed" || r.status === "error",
      );
      const firstFailed = failedResults[0];
      if (firstFailed) {
        throw new SelfTestHealthCheckFailedError(
          firstFailed.verifierName,
          this.config.health?.checks[0]?.url ?? "unknown",
        );
      }
    }

    if (report.phases.smoke.status === "failed") {
      const failedResults = report.phases.smoke.verifierResults.filter(
        (r) => r.status === "failed" || r.status === "error",
      );
      const firstFailed = failedResults[0];
      if (firstFailed) {
        const failedAssertions = firstFailed.assertions.filter((a) => !a.passed);
        throw new SelfTestVerificationFailedError(
          firstFailed.verifierName,
          failedAssertions,
          report,
        );
      }
    }

    // 4. Create tools for on-demand verification
    this.tools = createSelfTestTools(this.config, this.runner, this.lastReport);
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // Stop dev server
    await this.processManager.stop();
    this.tools = null;
  }

  /**
   * Get the tools for on-demand verification.
   * Must be called after onSessionStart.
   */
  getTools(): SelfTestTools {
    if (!this.tools) {
      throw new Error("Tools not available. Call onSessionStart() first.");
    }
    return this.tools;
  }

  /**
   * Get the report from the last session start run.
   */
  getLastReport(): SelfTestReport | null {
    return this.lastReport;
  }

  /**
   * Get the resolved config.
   */
  getConfig(): ResolvedSelfTestConfig {
    return this.config;
  }
}
