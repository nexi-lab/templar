#!/usr/bin/env node

import { generateAttackSurfaceSummary } from "./checks/attack-surface-summary.js";
import { getBuiltinChecks } from "./checks/index.js";
import { runAudit } from "./engine.js";
import { JsonReporter } from "./reporters/json-reporter.js";
import { TerminalReporter } from "./reporters/terminal-reporter.js";
import type { DoctorConfig, DoctorReport } from "./types.js";

// ---------------------------------------------------------------------------
// Argument parsing (minimal, no external CLI lib)
// ---------------------------------------------------------------------------

interface CliArgs {
  readonly workspace: string;
  readonly format: "terminal" | "json";
  readonly verbose: boolean;
  readonly disable: readonly string[];
  readonly nexusUrl?: string;
  readonly nexusApiKey?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let workspace = ".";
  let format: "terminal" | "json" = "terminal";
  let verbose = false;
  const disable: string[] = [];
  let nexusUrl: string | undefined;
  let nexusApiKey: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--workspace":
        if (next) {
          workspace = next;
          i++;
        }
        break;
      case "--format":
        if (next === "json" || next === "terminal") {
          format = next;
          i++;
        }
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--disable":
        if (next) {
          disable.push(...next.split(","));
          i++;
        }
        break;
      case "--nexus-url":
        if (next) {
          nexusUrl = next;
          i++;
        }
        break;
      case "--nexus-api-key":
        if (next) {
          nexusApiKey = next;
          i++;
        }
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return {
    workspace,
    format,
    verbose,
    disable,
    ...(nexusUrl ? { nexusUrl } : {}),
    ...(nexusApiKey ? { nexusApiKey } : {}),
  };
}

function printHelp(): void {
  const help = `
templar-doctor — Security scanner for Templar deployments

Usage: templar-doctor [options]

Options:
  --workspace <path>       Workspace to scan (default: .)
  --format terminal|json   Output format (default: terminal)
  --verbose                Show detailed timing and check info
  --disable <check1,check2>  Disable specific checks
  --nexus-url <url>        Nexus API URL (enables multi-tenant checks)
  --nexus-api-key <key>    Nexus API key
  --help                   Show this help message
`;
  console.log(help);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Build Nexus client if URL provided
  let nexus: DoctorConfig["nexus"];
  if (args.nexusUrl) {
    try {
      const { NexusClient } = await import("@nexus/sdk");
      nexus = new NexusClient({
        baseUrl: args.nexusUrl,
        ...(args.nexusApiKey ? { apiKey: args.nexusApiKey } : {}),
      });
    } catch {
      if (args.verbose) {
        console.error("Warning: @nexus/sdk not available, skipping Nexus checks");
      }
    }
  }

  const checks = getBuiltinChecks();

  const config: DoctorConfig = {
    workspace: args.workspace,
    ...(nexus ? { nexus } : {}),
    ...(args.disable.length > 0 ? { disabledChecks: args.disable } : {}),
    ...(args.verbose ? { verbose: true } : {}),
  };

  const report: DoctorReport = await runAudit(checks, config);

  // Generate attack surface summary and merge
  const summaryFindings = generateAttackSurfaceSummary(report.checkResults);
  const finalReport: DoctorReport =
    summaryFindings.length > 0
      ? {
          ...report,
          checkResults: [
            ...report.checkResults,
            {
              checkName: "attack-surface-summary",
              status: "findings",
              durationMs: 0,
              findings: summaryFindings,
            },
          ],
        }
      : report;

  // Output
  const reporter = args.format === "json" ? new JsonReporter() : new TerminalReporter();
  console.log(reporter.report(finalReport));

  process.exit(report.exitCode);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
