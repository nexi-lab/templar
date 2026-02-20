import { DoctorScanTimeoutError } from "@templar/errors";
import { createErrorResult, createSkippedResult } from "./finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorConfig,
  DoctorReport,
  DoctorSummary,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Semaphore-based concurrency limiter
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const current = index;
      index++;
      const task = tasks[current];
      if (task) {
        results[current] = await task();
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.allSettled(workers);

  return results;
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

function computeSummary(results: readonly DoctorCheckResult[]): DoctorSummary {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let checksRun = 0;
  let checksSkipped = 0;
  let checksFailed = 0;

  for (const result of results) {
    if (result.status === "skipped") {
      checksSkipped++;
    } else if (result.status === "error") {
      checksFailed++;
      checksRun++;
    } else {
      checksRun++;
    }

    for (const finding of result.findings) {
      switch (finding.severity) {
        case "CRITICAL":
          critical++;
          break;
        case "HIGH":
          high++;
          break;
        case "MEDIUM":
          medium++;
          break;
        case "LOW":
          low++;
          break;
      }
    }
  }

  return {
    total: critical + high + medium + low,
    critical,
    high,
    medium,
    low,
    checksRun,
    checksSkipped,
    checksFailed,
  };
}

// ---------------------------------------------------------------------------
// Exit code computation
// ---------------------------------------------------------------------------

function computeExitCode(summary: DoctorSummary): number {
  if (summary.critical > 0) return 2;
  if (summary.high > 0) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Single check executor with isolation
// ---------------------------------------------------------------------------

async function executeCheck(
  check: DoctorCheck,
  context: DoctorCheckContext,
): Promise<DoctorCheckResult> {
  // Auto-skip Nexus checks when no client available
  if (check.requiresNexus && !context.nexus) {
    return createSkippedResult(check.name, "Nexus client not available");
  }

  const start = performance.now();
  try {
    return await check.run(context);
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const error = err instanceof Error ? err : new Error(String(err));
    return createErrorResult(check.name, error, durationMs);
  }
}

// ---------------------------------------------------------------------------
// Audit engine
// ---------------------------------------------------------------------------

/**
 * Runs all security checks and produces an immutable `DoctorReport`.
 *
 * Checks run in parallel with a configurable concurrency limit (default: 4).
 * Each check is isolated — failures produce error results, not exceptions.
 * Nexus-dependent checks auto-skip when no `NexusClient` is provided.
 */
export async function runAudit(
  checks: readonly DoctorCheck[],
  config: DoctorConfig,
): Promise<DoctorReport> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Filter disabled checks
  const disabledSet = new Set(config.disabledChecks ?? []);
  const activeChecks = checks.filter((c) => !disabledSet.has(c.name));

  // Build context
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const context: DoctorCheckContext = {
    workspace: config.workspace,
    ...(config.nexus ? { nexus: config.nexus } : {}),
    abortSignal: controller.signal,
    ...(config.verbose ? { verbose: config.verbose } : {}),
  };

  try {
    // Build task list
    const tasks = activeChecks.map((check) => () => executeCheck(check, context));

    // Include skipped results for disabled checks
    const disabledResults: DoctorCheckResult[] = checks
      .filter((c) => disabledSet.has(c.name))
      .map((c) => createSkippedResult(c.name, "Disabled by configuration"));

    // Run with concurrency
    let activeResults: DoctorCheckResult[];
    try {
      activeResults = await runWithConcurrency(tasks, concurrency);
    } catch {
      throw new DoctorScanTimeoutError(timeoutMs);
    }

    const checkResults = [...activeResults, ...disabledResults];
    const summary = computeSummary(checkResults);
    const exitCode = computeExitCode(summary);

    const completedAt = new Date().toISOString();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      startedAt,
      completedAt,
      durationMs,
      checkResults,
      summary,
      exitCode,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
