import type {
  AggregatedGuardResult,
  ExecutionStrategy,
  Guard,
  GuardContext,
  GuardIssue,
  GuardResult,
  GuardTimingResult,
} from "./types.js";

/**
 * Runs a collection of guards either sequentially or in parallel.
 * Sequential mode short-circuits on the first error-severity issue.
 */
export class GuardRunner {
  private readonly guards: readonly Guard[];
  private readonly strategy: ExecutionStrategy;
  private readonly timeoutMs: number;

  constructor(guards: readonly Guard[], strategy: ExecutionStrategy, timeoutMs: number) {
    this.guards = guards;
    this.strategy = strategy;
    this.timeoutMs = timeoutMs;
  }

  async run(context: GuardContext): Promise<AggregatedGuardResult> {
    if (this.guards.length === 0) {
      return { valid: true, issues: [], guardResults: [] };
    }

    if (this.strategy === "parallel") {
      return this.runParallel(context);
    }

    return this.runSequential(context);
  }

  private async runSequential(context: GuardContext): Promise<AggregatedGuardResult> {
    const allIssues: GuardIssue[] = [];
    const guardResults: GuardTimingResult[] = [];

    for (const guard of this.guards) {
      const start = performance.now();
      const result = await this.runGuardWithTimeout(guard, context);
      const durationMs = performance.now() - start;

      guardResults.push({ guard: guard.name, durationMs, valid: result.valid });
      allIssues.push(...result.issues);

      // Short-circuit on first error
      const hasError = result.issues.some((i) => i.severity === "error");
      if (hasError) {
        return { valid: false, issues: allIssues, guardResults };
      }
    }

    return { valid: true, issues: allIssues, guardResults };
  }

  private async runParallel(context: GuardContext): Promise<AggregatedGuardResult> {
    const entries = this.guards.map(async (guard) => {
      const start = performance.now();
      try {
        const result = await this.runGuardWithTimeout(guard, context);
        const durationMs = performance.now() - start;
        return { guardName: guard.name, result, durationMs, error: null as Error | null };
      } catch (err) {
        const durationMs = performance.now() - start;
        return {
          guardName: guard.name,
          result: null as GuardResult | null,
          durationMs,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    });

    const results = await Promise.all(entries);

    const allIssues: GuardIssue[] = [];
    const guardResults: GuardTimingResult[] = [];
    let valid = true;

    for (const entry of results) {
      if (entry.result !== null) {
        guardResults.push({
          guard: entry.guardName,
          durationMs: entry.durationMs,
          valid: entry.result.valid,
        });
        allIssues.push(...entry.result.issues);
        if (!entry.result.valid) {
          valid = false;
        }
      } else {
        const errorMessage = entry.error?.message ?? "Unknown error";
        allIssues.push({
          guard: entry.guardName,
          path: [],
          message: `Guard execution failed: ${errorMessage}`,
          code: "GUARD_ERROR",
          severity: "error",
        });
        guardResults.push({ guard: entry.guardName, durationMs: entry.durationMs, valid: false });
        valid = false;
      }
    }

    return { valid, issues: allIssues, guardResults };
  }

  private async runGuardWithTimeout(guard: Guard, context: GuardContext): Promise<GuardResult> {
    const result = guard.validate(context);

    // If synchronous, return immediately
    if (!(result instanceof Promise)) {
      return result;
    }

    return Promise.race([
      result,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Guard "${guard.name}" timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      }),
    ]);
  }
}
