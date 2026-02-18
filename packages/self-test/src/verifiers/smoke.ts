import type {
  AssertionResult,
  SmokeConfig,
  SmokeStep,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

async function executeSmokeStep(step: SmokeStep, signal?: AbortSignal): Promise<AssertionResult> {
  const stepName = `${step.action}${step.url ? ` ${step.url}` : ""}${step.selector ? ` ${step.selector}` : ""}`;

  try {
    switch (step.action) {
      case "navigate": {
        if (!step.url) {
          return { name: stepName, passed: false, message: "navigate requires url" };
        }
        // Smoke-level navigate: just check the URL is reachable via fetch
        const response = await fetch(step.url, { method: "GET", ...(signal ? { signal } : {}) });
        const ok = response.status >= 200 && response.status < 400;
        return {
          name: stepName,
          passed: ok,
          ...(ok
            ? {}
            : {
                message: `Navigate returned status ${response.status}`,
                expected: "2xx/3xx",
                actual: response.status,
              }),
        };
      }
      case "assertStatus": {
        if (!step.url) {
          return { name: stepName, passed: false, message: "assertStatus requires url" };
        }
        const expectedStatus = step.expectedStatus ?? 200;
        const response = await fetch(step.url, { method: "GET", ...(signal ? { signal } : {}) });
        const passed = response.status === expectedStatus;
        return {
          name: stepName,
          passed,
          expected: expectedStatus,
          actual: response.status,
          ...(passed ? {} : { message: `Expected ${expectedStatus}, got ${response.status}` }),
        };
      }
      case "assertText": {
        if (!step.url || !step.text) {
          return { name: stepName, passed: false, message: "assertText requires url and text" };
        }
        const response = await fetch(step.url, { method: "GET", ...(signal ? { signal } : {}) });
        const body = await response.text();
        const found = body.includes(step.text);
        return {
          name: stepName,
          passed: found,
          ...(found
            ? {}
            : { message: `Text "${step.text}" not found in response body`, expected: step.text }),
        };
      }
      case "waitFor": {
        // In smoke mode without a browser, waitFor is a no-op success
        // (it would require Playwright). We skip it gracefully.
        return { name: stepName, passed: true, message: "waitFor skipped (no browser)" };
      }
      default: {
        return {
          name: stepName,
          passed: false,
          message: `Unknown smoke action: ${step.action as string}`,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: stepName, passed: false, message };
  }
}

/**
 * SmokeVerifier — critical-path validation via fetch-based checks.
 *
 * Runs as part of the smoke phase. Orchestrates basic health + navigation
 * checks using native fetch (no Playwright required). Falls back gracefully
 * for browser-only actions like waitFor.
 */
export class SmokeVerifier implements Verifier {
  readonly name: string;
  readonly phase = "smoke" as const;
  private readonly config: SmokeConfig;

  constructor(config: SmokeConfig, name?: string) {
    this.config = config;
    this.name = name ?? "smoke";
  }

  async run(context: VerifierContext): Promise<VerifierResult> {
    const start = Date.now();
    const assertions: AssertionResult[] = [];

    // Create a timeout controller
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Chain context abort signal
    const contextAbortHandler = (): void => controller.abort();
    context.abortSignal?.addEventListener("abort", contextAbortHandler, { once: true });

    try {
      for (const step of this.config.steps) {
        if (controller.signal.aborted) {
          assertions.push({
            name: `${step.action}`,
            passed: false,
            message: "Aborted or timed out",
          });
          continue;
        }

        const result = await executeSmokeStep(step, controller.signal);
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
