import type {
  ApiTestConfig,
  AssertionResult,
  BrowserStep,
  HealthCheck,
  Phase,
  PhaseResult,
  ScreenshotCapture,
  SelfTestConfig,
  SmokeStep,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "../types.js";

// ============================================================================
// Context factories
// ============================================================================

export function makeVerifierContext(overrides?: Partial<VerifierContext>): VerifierContext {
  return {
    workspace: "/tmp/test-workspace",
    ...overrides,
  };
}

// ============================================================================
// Config factories
// ============================================================================

export function makeHealthCheck(overrides?: Partial<HealthCheck>): HealthCheck {
  return {
    name: "test-health",
    url: "http://localhost:3000/health",
    ...overrides,
  };
}

export function makeSmokeStep(overrides?: Partial<SmokeStep>): SmokeStep {
  return {
    action: "navigate",
    url: "http://localhost:3000",
    ...overrides,
  };
}

export function makeBrowserStep(overrides?: Partial<BrowserStep>): BrowserStep {
  return {
    action: "navigate",
    url: "http://localhost:3000",
    ...overrides,
  };
}

export function makeApiTestConfig(overrides?: Partial<ApiTestConfig>): ApiTestConfig {
  return {
    baseUrl: "http://localhost:3000",
    steps: [
      {
        method: "GET",
        path: "/api/health",
        expectedStatus: 200,
      },
    ],
    ...overrides,
  };
}

export function makeSelfTestConfig(overrides?: Partial<SelfTestConfig>): SelfTestConfig {
  return {
    workspace: "/tmp/test-workspace",
    ...overrides,
  };
}

// ============================================================================
// Result factories
// ============================================================================

export function makeAssertionResult(overrides?: Partial<AssertionResult>): AssertionResult {
  return {
    name: "test-assertion",
    passed: true,
    ...overrides,
  };
}

export function makeScreenshotCapture(overrides?: Partial<ScreenshotCapture>): ScreenshotCapture {
  return {
    name: "test-screenshot",
    base64: "iVBORw0KGgo=",
    timestamp: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
    ...overrides,
  };
}

export function makeVerifierResult(overrides?: Partial<VerifierResult>): VerifierResult {
  return {
    verifierName: "test-verifier",
    phase: "preflight",
    status: "passed",
    durationMs: 100,
    assertions: [makeAssertionResult()],
    screenshots: [],
    ...overrides,
  };
}

export function makePhaseResult(overrides?: Partial<PhaseResult>): PhaseResult {
  return {
    status: "passed",
    durationMs: 100,
    verifierResults: [makeVerifierResult()],
    ...overrides,
  };
}

/**
 * Create a minimal mock Verifier for testing.
 */
export function makeMockVerifier(config: {
  name?: string;
  phase?: Phase;
  result?: Partial<VerifierResult>;
  setupFn?: () => Promise<void>;
  teardownFn?: () => Promise<void>;
  runFn?: () => Promise<VerifierResult>;
}): Verifier {
  const phase: Phase = config.phase ?? "preflight";
  const name: string = config.name ?? `mock-${phase}-verifier`;
  const result = makeVerifierResult({
    verifierName: name,
    phase,
    ...config.result,
  });

  const verifier: Verifier = {
    name,
    phase,
    run: config.runFn ?? (async () => result),
  };

  if (config.setupFn && config.teardownFn) {
    return { ...verifier, setup: config.setupFn, teardown: config.teardownFn };
  }
  if (config.setupFn) {
    return { ...verifier, setup: config.setupFn };
  }
  if (config.teardownFn) {
    return { ...verifier, teardown: config.teardownFn };
  }

  return verifier;
}
