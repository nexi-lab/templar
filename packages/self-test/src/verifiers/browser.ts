import { SelfTestConfigurationInvalidError } from "@templar/errors";
import type {
  AssertionResult,
  BrowserConfig,
  BrowserStep,
  ScreenshotCapture,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "../types.js";

const _DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/** Playwright types — minimal structural interface to avoid hard dep */
interface PlaywrightBrowser {
  newContext(opts?: { viewport?: { width: number; height: number } }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightPage {
  goto(url: string): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  textContent(selector: string): Promise<string | null>;
  screenshot(opts?: { type?: "png"; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launch(opts?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("playwright")) as unknown as PlaywrightModule;
  } catch {
    throw new SelfTestConfigurationInvalidError([
      "playwright is not installed. Install it with: pnpm add -D playwright",
    ]);
  }
}

async function captureScreenshot(
  page: PlaywrightPage,
  name: string,
  viewport: { width: number; height: number },
): Promise<ScreenshotCapture> {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return {
    name,
    base64: buffer.toString("base64"),
    timestamp: new Date().toISOString(),
    viewport,
  };
}

async function executeStep(step: BrowserStep, page: PlaywrightPage): Promise<AssertionResult> {
  const stepName = `${step.action}${step.selector ? ` ${step.selector}` : ""}${step.url ? ` ${step.url}` : ""}`;

  try {
    switch (step.action) {
      case "navigate": {
        if (!step.url) {
          return { name: stepName, passed: false, message: "navigate requires url" };
        }
        await page.goto(step.url);
        return { name: stepName, passed: true };
      }
      case "fill": {
        if (!step.selector || step.value === undefined) {
          return { name: stepName, passed: false, message: "fill requires selector and value" };
        }
        await page.fill(step.selector, step.value);
        return { name: stepName, passed: true };
      }
      case "click": {
        if (!step.selector) {
          return { name: stepName, passed: false, message: "click requires selector" };
        }
        await page.click(step.selector);
        return { name: stepName, passed: true };
      }
      case "waitFor": {
        if (!step.selector) {
          return { name: stepName, passed: false, message: "waitFor requires selector" };
        }
        await page.waitForSelector(step.selector, { timeout: 10_000 });
        return { name: stepName, passed: true };
      }
      case "screenshot": {
        // Screenshot is always "passed" — it's a capture, not an assertion
        return { name: stepName, passed: true };
      }
      case "assertText": {
        if (!step.selector || !step.text) {
          return {
            name: stepName,
            passed: false,
            message: "assertText requires selector and text",
          };
        }
        const content = await page.textContent(step.selector);
        const found = content?.includes(step.text) ?? false;
        return {
          name: stepName,
          passed: found,
          ...(found
            ? {}
            : { message: `Text "${step.text}" not found`, expected: step.text, actual: content }),
        };
      }
      default: {
        return {
          name: stepName,
          passed: false,
          message: `Unknown action: ${step.action as string}`,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: stepName, passed: false, message };
  }
}

/**
 * BrowserVerifier — Playwright-based browser automation testing.
 *
 * Runs as part of the verification phase. Requires playwright as
 * an optional peer dependency. Creates a fresh browser context per run.
 */
export class BrowserVerifier implements Verifier {
  readonly name: string;
  readonly phase = "verification" as const;
  private readonly steps: readonly BrowserStep[];
  private readonly browserConfig: BrowserConfig;

  constructor(steps: readonly BrowserStep[], config?: BrowserConfig, name?: string) {
    this.steps = steps;
    this.browserConfig = config ?? {};
    this.name = name ?? "browser";
  }

  async run(context: VerifierContext): Promise<VerifierResult> {
    const start = Date.now();
    const viewport = this.browserConfig.viewport ?? DEFAULT_VIEWPORT;
    const screenshotOnFailure = this.browserConfig.screenshotOnFailure ?? true;
    const assertions: AssertionResult[] = [];
    const screenshots: ScreenshotCapture[] = [];

    const pw = await loadPlaywright();
    const browser = await pw.chromium.launch({ headless: true });

    try {
      const browserContext = await browser.newContext({ viewport });
      const page = await browserContext.newPage();

      try {
        for (const step of this.steps) {
          if (context.abortSignal?.aborted) {
            assertions.push({
              name: `${step.action}`,
              passed: false,
              message: "Aborted",
            });
            continue;
          }

          const result = await executeStep(step, page);
          assertions.push(result);

          // Handle screenshot step
          if (step.action === "screenshot") {
            const capture = await captureScreenshot(
              page,
              step.screenshotName ?? `screenshot-${screenshots.length}`,
              viewport,
            );
            screenshots.push(capture);
          }

          // Capture screenshot on failure if configured
          if (!result.passed && screenshotOnFailure) {
            const capture = await captureScreenshot(
              page,
              `failure-${assertions.length - 1}`,
              viewport,
            );
            screenshots.push(capture);
          }
        }
      } finally {
        await page.close();
        await browserContext.close();
      }
    } finally {
      await browser.close();
    }

    const allPassed = assertions.every((a) => a.passed);

    return {
      verifierName: this.name,
      phase: this.phase,
      status: allPassed ? "passed" : "failed",
      durationMs: Date.now() - start,
      assertions,
      screenshots,
    };
  }
}
