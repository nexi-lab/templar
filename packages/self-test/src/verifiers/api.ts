import type {
  ApiTestConfig,
  ApiTestStep,
  AssertionResult,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

async function executeStep(
  step: ApiTestStep,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<AssertionResult> {
  const url = `${baseUrl}${step.path}`;
  const stepName = `${step.method} ${step.path}`;

  try {
    const response = await fetch(url, {
      method: step.method,
      headers: {
        "Content-Type": "application/json",
        ...step.headers,
      },
      ...(step.body !== undefined ? { body: JSON.stringify(step.body) } : {}),
      ...(signal ? { signal } : {}),
    });

    // Check status code
    if (step.expectedStatus !== undefined && response.status !== step.expectedStatus) {
      return {
        name: stepName,
        passed: false,
        message: `Expected status ${step.expectedStatus}, got ${response.status}`,
        expected: step.expectedStatus,
        actual: response.status,
      };
    }

    // Check response body
    if (step.expectedBody !== undefined) {
      const body: unknown = await response.json();
      const expected = JSON.stringify(step.expectedBody);
      const actual = JSON.stringify(body);
      if (expected !== actual) {
        return {
          name: stepName,
          passed: false,
          message: `Response body mismatch`,
          expected: step.expectedBody,
          actual: body,
        };
      }
    }

    return {
      name: stepName,
      passed: true,
      ...(step.expectedStatus !== undefined
        ? { expected: step.expectedStatus, actual: response.status }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: stepName,
      passed: false,
      message: `Request failed: ${message}`,
    };
  }
}

/**
 * ApiVerifier — fetch-based API endpoint testing.
 *
 * Runs as part of the verification phase. Tests API endpoints
 * sequentially with status and body assertions.
 */
export class ApiVerifier implements Verifier {
  readonly name: string;
  readonly phase = "verification" as const;
  private readonly config: ApiTestConfig;

  constructor(config: ApiTestConfig, name?: string) {
    this.config = config;
    this.name = name ?? "api";
  }

  async run(context: VerifierContext): Promise<VerifierResult> {
    const start = Date.now();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const assertions: AssertionResult[] = [];
    const baseUrl = this.config.baseUrl;

    // Create a timeout controller that composes with the context signal
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If context has an abort signal, chain it
    const contextAbortHandler = (): void => controller.abort();
    context.abortSignal?.addEventListener("abort", contextAbortHandler, { once: true });

    try {
      for (const step of this.config.steps) {
        if (controller.signal.aborted) {
          assertions.push({
            name: `${step.method} ${step.path}`,
            passed: false,
            message: "Aborted or timed out",
          });
          continue;
        }

        const result = await executeStep(step, baseUrl, controller.signal);
        assertions.push(result);
      }
    } finally {
      clearTimeout(timer);
      context.abortSignal?.removeEventListener("abort", contextAbortHandler);
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
