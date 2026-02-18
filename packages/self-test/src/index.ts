/**
 * @templar/self-test
 *
 * Pluggable self-verification for AI agents: health checks, smoke tests,
 * API testing, and browser automation integrated into the session lifecycle.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  ApiConfig,
  ApiTestConfig,
  ApiTestStep,
  AssertionResult,
  BrowserConfig,
  BrowserStep,
  CTRFTest,
  DevServerConfig,
  HealthCheck,
  HealthConfig,
  Phase,
  PhaseResult,
  ReportConfig,
  ResolvedSelfTestConfig,
  ScreenshotCapture,
  ScreenshotConfig,
  SelfTestConfig,
  SelfTestReport,
  SelfTestTools,
  SmokeConfig,
  SmokeStep,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "./types.js";

// ============================================================================
// VALIDATION
// ============================================================================

export { resolveSelfTestConfig, validateSelfTestConfig } from "./validation.js";

// ============================================================================
// VERIFIERS
// ============================================================================

export { ApiVerifier } from "./verifiers/api.js";
export { BrowserVerifier } from "./verifiers/browser.js";
export { HealthVerifier } from "./verifiers/health.js";
export { SmokeVerifier } from "./verifiers/smoke.js";

// ============================================================================
// RUNNER + INFRASTRUCTURE
// ============================================================================

export { ProcessManager } from "./process-manager.js";
export { ReportBuilder } from "./report-builder.js";
export { SelfTestRunner } from "./runner.js";

// ============================================================================
// MIDDLEWARE + TOOLS
// ============================================================================

export { SelfTestMiddleware } from "./middleware.js";
export { createSelfTestTools } from "./tools.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/self-test";
export const PACKAGE_VERSION = "0.0.0";
