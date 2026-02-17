import type { ExecutionLimitsConfig } from "@templar/core";
import { ExecutionTimeoutError, IterationLimitError } from "@templar/errors";

/** Default execution limits */
export const DEFAULT_EXECUTION_LIMITS: Readonly<
  Required<Omit<ExecutionLimitsConfig, "loopDetection">>
> = {
  maxIterations: 25,
  maxExecutionTimeMs: 120_000, // 2 minutes
} as const;

/**
 * Enforces hard iteration and time limits on agent execution.
 *
 * Used by the engine wrapper around createDeepAgent(). Create one
 * per agent run, call `check()` before each iteration. Throws
 * IterationLimitError or ExecutionTimeoutError when limits are hit.
 */
export class IterationGuard {
  private readonly maxIterations: number;
  private readonly maxExecutionTimeMs: number;
  private readonly startTime: number;
  private iterationCount = 0;

  constructor(limits?: Pick<ExecutionLimitsConfig, "maxIterations" | "maxExecutionTimeMs">) {
    this.maxIterations = limits?.maxIterations ?? DEFAULT_EXECUTION_LIMITS.maxIterations;
    this.maxExecutionTimeMs =
      limits?.maxExecutionTimeMs ?? DEFAULT_EXECUTION_LIMITS.maxExecutionTimeMs;
    this.startTime = Date.now();

    if (!Number.isFinite(this.maxIterations) || this.maxIterations < 1) {
      throw new RangeError(`maxIterations must be a finite number >= 1, got ${this.maxIterations}`);
    }
    if (!Number.isFinite(this.maxExecutionTimeMs) || this.maxExecutionTimeMs < 0) {
      throw new RangeError(
        `maxExecutionTimeMs must be a finite number >= 0, got ${this.maxExecutionTimeMs}`,
      );
    }
  }

  /**
   * Call before each iteration. Throws if any limit is exceeded.
   * Time is checked first (cheaper), then iteration count.
   */
  check(): void {
    const elapsed = Date.now() - this.startTime;
    if (elapsed >= this.maxExecutionTimeMs) {
      throw new ExecutionTimeoutError(elapsed, this.maxExecutionTimeMs);
    }

    this.iterationCount++;
    if (this.iterationCount > this.maxIterations) {
      throw new IterationLimitError(this.iterationCount, this.maxIterations);
    }
  }

  /** Current iteration count */
  get count(): number {
    return this.iterationCount;
  }

  /** Maximum iterations configured */
  get max(): number {
    return this.maxIterations;
  }

  /** Elapsed time since guard creation in ms */
  get elapsedMs(): number {
    return Date.now() - this.startTime;
  }
}
