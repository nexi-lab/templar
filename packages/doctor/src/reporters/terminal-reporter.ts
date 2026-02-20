import type { DoctorReport, Severity } from "../types.js";
import type { DoctorReporter } from "./types.js";

// ---------------------------------------------------------------------------
// ANSI helpers (no chalk dependency)
// ---------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: RED,
  HIGH: MAGENTA,
  MEDIUM: YELLOW,
  LOW: CYAN,
};

const STATUS_ICONS: Record<string, string> = {
  passed: `${GREEN}✓${RESET}`,
  findings: `${RED}✗${RESET}`,
  skipped: `${DIM}⊘${RESET}`,
  error: `${RED}!${RESET}`,
};

// ---------------------------------------------------------------------------
// Terminal reporter
// ---------------------------------------------------------------------------

/**
 * Renders a human-readable ANSI-colored terminal report.
 */
export class TerminalReporter implements DoctorReporter {
  readonly name = "terminal";

  report(result: DoctorReport): string {
    const lines: string[] = [];

    lines.push("");
    lines.push(`${BOLD}Templar Doctor — Security Audit Report${RESET}`);
    lines.push(`${"─".repeat(50)}`);
    lines.push("");

    // Check results
    for (const check of result.checkResults) {
      const icon = STATUS_ICONS[check.status] ?? "?";
      const timing = check.durationMs > 0 ? `${DIM}(${check.durationMs}ms)${RESET}` : "";
      lines.push(`  ${icon} ${check.checkName} ${timing}`);

      if (check.status === "skipped" && check.skipReason) {
        lines.push(`    ${DIM}Skipped: ${check.skipReason}${RESET}`);
      }

      if (check.status === "error" && check.error) {
        lines.push(`    ${RED}Error: ${check.error.message}${RESET}`);
      }

      if (check.findings.length > 0) {
        for (const finding of check.findings) {
          const color = SEVERITY_COLORS[finding.severity];
          lines.push(`    ${color}[${finding.severity}]${RESET} ${finding.title}`);
          lines.push(`      ${DIM}${finding.description}${RESET}`);
          lines.push(`      ${DIM}Location: ${finding.location}${RESET}`);
          lines.push(`      ${DIM}Remediation: ${finding.remediation}${RESET}`);
        }
      }
    }

    lines.push("");
    lines.push(`${"─".repeat(50)}`);

    // Summary
    const s = result.summary;
    const summaryParts: string[] = [];
    if (s.critical > 0) summaryParts.push(`${RED}${s.critical} CRITICAL${RESET}`);
    if (s.high > 0) summaryParts.push(`${MAGENTA}${s.high} HIGH${RESET}`);
    if (s.medium > 0) summaryParts.push(`${YELLOW}${s.medium} MEDIUM${RESET}`);
    if (s.low > 0) summaryParts.push(`${CYAN}${s.low} LOW${RESET}`);

    if (summaryParts.length === 0) {
      lines.push(`  ${GREEN}${BOLD}No findings — all checks passed!${RESET}`);
    } else {
      lines.push(`  ${BOLD}Findings:${RESET} ${summaryParts.join(", ")}`);
    }

    lines.push(
      `  ${DIM}Checks: ${s.checksRun} run, ${s.checksSkipped} skipped, ${s.checksFailed} failed${RESET}`,
    );
    lines.push(`  ${DIM}Duration: ${result.durationMs}ms${RESET}`);
    lines.push("");

    return lines.join("\n");
  }
}
