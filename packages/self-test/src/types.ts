/**
 * @templar/self-test — Type definitions
 *
 * All interfaces for the pluggable self-verification system.
 */

// ============================================================================
// PHASE TYPES
// ============================================================================

/** Verification pipeline phases, executed in order */
export type Phase = "preflight" | "smoke" | "verification";

// ============================================================================
// VERIFIER STRATEGY
// ============================================================================

/** Context passed to each verifier */
export interface VerifierContext {
  readonly workspace: string;
  readonly baseUrl?: string;
  readonly sessionId?: string;
  readonly abortSignal?: AbortSignal;
}

/** Result of a single assertion within a verifier */
export interface AssertionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

/** Captured screenshot */
export interface ScreenshotCapture {
  readonly name: string;
  readonly base64: string;
  readonly timestamp: string;
  readonly viewport: { readonly width: number; readonly height: number };
}

/** Result produced by a single verifier run */
export interface VerifierResult {
  readonly verifierName: string;
  readonly phase: Phase;
  readonly status: "passed" | "failed" | "skipped" | "error";
  readonly durationMs: number;
  readonly assertions: readonly AssertionResult[];
  readonly screenshots: readonly ScreenshotCapture[];
  readonly error?: Error;
}

/** Strategy pattern: a single verification step */
export interface Verifier {
  readonly name: string;
  readonly phase: Phase;
  run(context: VerifierContext): Promise<VerifierResult>;
  setup?(context: VerifierContext): Promise<void>;
  teardown?(context: VerifierContext): Promise<void>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Dev server management config */
export interface DevServerConfig {
  readonly command: string;
  readonly url: string;
  readonly timeoutMs?: number;
  readonly env?: Record<string, string>;
  readonly reuseExisting?: boolean;
}

/** Individual health check */
export interface HealthCheck {
  readonly name: string;
  readonly url: string;
  readonly expectedStatus?: number;
  readonly timeoutMs?: number;
}

/** Health check config */
export interface HealthConfig {
  readonly checks: readonly HealthCheck[];
  readonly timeoutMs?: number;
}

/** Smoke test step */
export interface SmokeStep {
  readonly action: "navigate" | "waitFor" | "assertText" | "assertStatus";
  readonly url?: string;
  readonly selector?: string;
  readonly text?: string;
  readonly expectedStatus?: number;
}

/** Smoke test config */
export interface SmokeConfig {
  readonly steps: readonly SmokeStep[];
  readonly timeoutMs?: number;
}

/** Browser automation config */
export interface BrowserConfig {
  readonly timeoutMs?: number;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly screenshotOnFailure?: boolean;
}

/** API test config */
export interface ApiConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

/** Screenshot storage config */
export interface ScreenshotConfig {
  readonly storage: "base64" | "disk";
  readonly directory?: string;
  readonly onPass?: "always" | "never";
  readonly onFail?: "always" | "never";
}

/** Report output config */
export interface ReportConfig {
  readonly outputPath?: string;
  readonly includeScreenshots?: boolean;
}

/** Top-level config for @templar/self-test */
export interface SelfTestConfig {
  readonly workspace: string;
  readonly devServer?: DevServerConfig;
  readonly health?: HealthConfig;
  readonly smoke?: SmokeConfig;
  readonly browser?: BrowserConfig;
  readonly api?: ApiConfig;
  readonly screenshots?: ScreenshotConfig;
  readonly report?: ReportConfig;
  readonly maxTotalDurationMs?: number;
}

/** Resolved config with all defaults applied */
export interface ResolvedSelfTestConfig {
  readonly workspace: string;
  readonly devServer?: DevServerConfig;
  readonly health?: HealthConfig;
  readonly smoke?: SmokeConfig;
  readonly browser: Required<BrowserConfig>;
  readonly api?: ApiConfig;
  readonly screenshots: Required<ScreenshotConfig>;
  readonly report: Required<ReportConfig>;
  readonly maxTotalDurationMs: number;
}

// ============================================================================
// API TEST TYPES
// ============================================================================

/** A single API test step */
export interface ApiTestStep {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly expectedStatus?: number;
  readonly expectedBody?: unknown;
}

/** Config for an API test run */
export interface ApiTestConfig {
  readonly baseUrl: string;
  readonly steps: readonly ApiTestStep[];
  readonly timeoutMs?: number;
}

// ============================================================================
// BROWSER TEST TYPES
// ============================================================================

/** A single browser automation step */
export interface BrowserStep {
  readonly action: "navigate" | "fill" | "click" | "waitFor" | "screenshot" | "assertText";
  readonly url?: string;
  readonly selector?: string;
  readonly value?: string;
  readonly text?: string;
  readonly screenshotName?: string;
}

// ============================================================================
// CTRF REPORT FORMAT
// ============================================================================

/** A single test in the CTRF report */
export interface CTRFTest {
  readonly name: string;
  readonly status: "passed" | "failed" | "skipped" | "pending" | "other";
  readonly duration: number;
  readonly message?: string;
  readonly trace?: string;
  readonly extra?: Record<string, unknown>;
}

/** Result of a single pipeline phase */
export interface PhaseResult {
  readonly status: "passed" | "failed" | "skipped";
  readonly durationMs: number;
  readonly verifierResults: readonly VerifierResult[];
}

/** Full self-test CTRF-compatible report */
export interface SelfTestReport {
  readonly results: {
    readonly tool: { readonly name: "@templar/self-test"; readonly version: string };
    readonly summary: {
      readonly tests: number;
      readonly passed: number;
      readonly failed: number;
      readonly pending: number;
      readonly skipped: number;
      readonly other: number;
      readonly start: number;
      readonly stop: number;
    };
    readonly tests: readonly CTRFTest[];
    readonly environment?: Record<string, unknown>;
  };
  readonly phases: {
    readonly preflight: PhaseResult;
    readonly smoke: PhaseResult;
    readonly verification: PhaseResult;
  };
}

// ============================================================================
// TOOLS INTERFACE
// ============================================================================

/** Tools exposed to the agent for on-demand verification */
export interface SelfTestTools {
  runPreflight(): Promise<PhaseResult>;
  runSmoke(steps: readonly SmokeStep[]): Promise<PhaseResult>;
  runApiTest(config: ApiTestConfig): Promise<VerifierResult>;
  runBrowserTest(steps: readonly BrowserStep[]): Promise<VerifierResult>;
  runFullSuite(): Promise<SelfTestReport>;
  getLastReport(): SelfTestReport | null;
}
