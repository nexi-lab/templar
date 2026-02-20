import type { TemplarMiddleware } from "@templar/core";
import { DoctorCheckFailedError, DoctorConfigurationError } from "@templar/errors";
import { getBuiltinChecks } from "./checks/index.js";
import { runAudit } from "./engine.js";
import type { DoctorCheck, DoctorConfig, DoctorReport } from "./types.js";

// ---------------------------------------------------------------------------
// Doctor middleware
// ---------------------------------------------------------------------------

/**
 * Templar middleware that runs a security audit on session start.
 * Throws `DoctorCheckFailedError` if CRITICAL findings are present.
 */
export class DoctorMiddleware implements TemplarMiddleware {
  readonly name = "templar:doctor";
  private readonly config: DoctorConfig;
  private readonly checks: readonly DoctorCheck[];
  private report: DoctorReport | null = null;

  constructor(config: DoctorConfig) {
    if (!config.workspace) {
      throw new DoctorConfigurationError("workspace is required");
    }

    const builtinChecks = getBuiltinChecks();
    this.checks = config.checks ? [...builtinChecks, ...config.checks] : builtinChecks;
    this.config = config;
  }

  async onSessionStart(): Promise<void> {
    this.report = await runAudit(this.checks, this.config);

    if (this.report.summary.critical > 0) {
      throw new DoctorCheckFailedError(
        "templar:doctor",
        `Security audit found ${this.report.summary.critical} CRITICAL finding(s)`,
      );
    }
  }

  async onSessionEnd(): Promise<void> {
    // no-op
  }

  /**
   * Returns the cached audit report, or null if not yet run.
   */
  getReport(): DoctorReport | null {
    return this.report;
  }
}
