import { SelfTestHealthCheckFailedError, SelfTestTimeoutError } from "@templar/errors";
import type {
  AssertionResult,
  HealthCheck,
  HealthConfig,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "../types.js";

const BACKOFF_BASE_MS = 100;
const BACKOFF_CAP_MS = 2_000;
const JITTER_MS = 50;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_EXPECTED_STATUS = 200;

function getBackoffDelay(attempt: number): number {
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  const jitter = (Math.random() - 0.5) * 2 * JITTER_MS;
  return Math.max(0, exponential + jitter);
}

async function pollCheck(
  check: HealthCheck,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AssertionResult> {
  const expectedStatus = check.expectedStatus ?? DEFAULT_EXPECTED_STATUS;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return {
        name: check.name,
        passed: false,
        message: "Aborted",
      };
    }

    try {
      const response = await fetch(check.url, {
        method: "GET",
        ...(signal ? { signal } : {}),
      });
      lastStatus = response.status;

      if (response.status === expectedStatus) {
        return {
          name: check.name,
          passed: true,
          expected: expectedStatus,
          actual: response.status,
        };
      }
      lastError = `Expected status ${expectedStatus}, got ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (signal?.aborted) {
        return {
          name: check.name,
          passed: false,
          message: "Aborted",
        };
      }
    }

    const delay = getBackoffDelay(attempt);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.min(delay, remaining));
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

    attempt++;
  }

  return {
    name: check.name,
    passed: false,
    message: lastError ?? "Timed out waiting for health check",
    expected: expectedStatus,
    ...(lastStatus !== undefined ? { actual: lastStatus } : {}),
  };
}

/**
 * HealthVerifier — polls health check URLs with exponential backoff.
 *
 * Runs as part of the preflight phase. All checks must pass for
 * the phase to succeed.
 */
export class HealthVerifier implements Verifier {
  readonly name: string;
  readonly phase = "preflight" as const;
  private readonly config: HealthConfig;

  constructor(config: HealthConfig, name?: string) {
    this.config = config;
    this.name = name ?? "health";
  }

  async run(context: VerifierContext): Promise<VerifierResult> {
    const start = Date.now();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const assertions: AssertionResult[] = [];

    for (const check of this.config.checks) {
      if (context.abortSignal?.aborted) {
        assertions.push({ name: check.name, passed: false, message: "Aborted" });
        continue;
      }

      const checkTimeout = check.timeoutMs ?? timeoutMs;
      const result = await pollCheck(check, checkTimeout, context.abortSignal);
      assertions.push(result);

      // If a check fails, throw immediately for preflight gate
      if (!result.passed) {
        const elapsed = Date.now() - start;
        const failedResult: VerifierResult = {
          verifierName: this.name,
          phase: this.phase,
          status: "failed",
          durationMs: elapsed,
          assertions,
          screenshots: [],
        };

        if (result.message === "Aborted") {
          return failedResult;
        }

        // Check if this was a timeout
        if (elapsed >= checkTimeout) {
          throw new SelfTestTimeoutError(this.name, checkTimeout, elapsed);
        }

        throw new SelfTestHealthCheckFailedError(
          check.name,
          check.url,
          typeof result.actual === "number" ? result.actual : undefined,
        );
      }
    }

    const allPassed = assertions.every((a) => a.passed);

    return {
      verifierName: this.name,
      phase: this.phase,
      status: allPassed ? "passed" : "failed",
      durationMs: Date.now() - start,
      assertions,
      screenshots: [],
    };
  }
}
