import { GuardrailRetryExhaustedError } from "@templar/errors";
import type {
  AggregatedGuardResult,
  GuardIssue,
  GuardTimingResult,
  OnFailureMode,
  ValidationMetrics,
} from "./types.js";

export interface RetryExecutorConfig {
  readonly maxRetries: number;
  readonly onFailure: OnFailureMode;
  readonly onWarning?: (issues: readonly GuardIssue[]) => void;
}

/**
 * Retry executor that re-invokes the `next` handler when guards fail,
 * optionally injecting error feedback into the request.
 */
export class RetryExecutor<TReq, TRes> {
  private readonly config: RetryExecutorConfig;

  constructor(config: RetryExecutorConfig) {
    this.config = config;
  }

  async execute(
    req: TReq,
    next: (req: TReq) => Promise<TRes>,
    validate: (
      response: TRes,
      attempt: number,
      previousIssues: readonly GuardIssue[],
    ) => Promise<AggregatedGuardResult>,
    injectFeedback: (req: TReq, issues: readonly GuardIssue[]) => TReq,
    hook: "model" | "tool" | "turn",
  ): Promise<{ readonly response: TRes; readonly metrics: ValidationMetrics }> {
    const overallStart = performance.now();
    let currentReq = req;
    let lastIssues: readonly GuardIssue[] = [];
    let allGuardResults: GuardTimingResult[] = [];
    let lastResponse: TRes | undefined;
    const totalAttempts = 1 + this.config.maxRetries;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const response = await next(currentReq);
      lastResponse = response;
      const result = await validate(response, attempt, lastIssues);

      allGuardResults = [...allGuardResults, ...result.guardResults];

      if (result.valid) {
        return {
          response,
          metrics: {
            hook,
            totalAttempts: attempt,
            totalDurationMs: performance.now() - overallStart,
            passed: true,
            guardResults: allGuardResults,
          },
        };
      }

      lastIssues = result.issues;

      // Last attempt — no more retries
      if (attempt === totalAttempts) {
        break;
      }

      // Inject feedback for next attempt (only if retrying)
      if (this.config.onFailure === "retry") {
        currentReq = injectFeedback(currentReq, result.issues);
      } else {
        break;
      }
    }

    const metrics: ValidationMetrics = {
      hook,
      totalAttempts,
      totalDurationMs: performance.now() - overallStart,
      passed: false,
      guardResults: allGuardResults,
    };

    if (this.config.onFailure === "warn") {
      this.config.onWarning?.(lastIssues);
      return { response: lastResponse as TRes, metrics };
    }

    // "throw" or "retry" that exhausted attempts
    throw new GuardrailRetryExhaustedError(totalAttempts, lastIssues);
  }
}

/**
 * Build error feedback message from guard issues for model call retries.
 */
export function buildFeedbackMessage(issues: readonly GuardIssue[]): string {
  const lines = issues
    .filter((i) => i.severity === "error")
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    });

  return [
    "Your previous response failed validation:",
    ...lines,
    "Please fix these issues in your next response.",
  ].join("\n");
}
