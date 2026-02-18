import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all self-test errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for self-test verification errors.
 *
 * Enables generic catch: `if (e instanceof SelfTestError)`
 * while specific subclasses allow precise handling.
 */
export abstract class SelfTestError extends TemplarError {}

// ---------------------------------------------------------------------------
// Health check failed
// ---------------------------------------------------------------------------

/**
 * Thrown when one or more health checks fail during preflight.
 */
export class SelfTestHealthCheckFailedError extends SelfTestError {
  readonly _tag = "SelfTestError" as const;
  readonly code = "SELF_TEST_HEALTH_CHECK_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly verifierName: string;
  readonly url: string;
  readonly lastStatus?: number | undefined;

  constructor(verifierName: string, url: string, lastStatus?: number) {
    const statusInfo = lastStatus !== undefined ? ` (last status: ${lastStatus})` : "";
    super(`Health check failed: ${verifierName} at ${url}${statusInfo}`);
    const entry = ERROR_CATALOG.SELF_TEST_HEALTH_CHECK_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.verifierName = verifierName;
    this.url = url;
    this.lastStatus = lastStatus;
  }
}

// ---------------------------------------------------------------------------
// Verification failed
// ---------------------------------------------------------------------------

/** Shape of a failed assertion (structurally compatible with @templar/self-test AssertionResult) */
interface FailedAssertionDetail {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

/** Shape of a self-test report reference (structurally compatible) */
interface SelfTestReportRef {
  readonly results: {
    readonly summary: {
      readonly tests: number;
      readonly passed: number;
      readonly failed: number;
    };
  };
}

/**
 * Thrown when one or more verification assertions fail.
 */
export class SelfTestVerificationFailedError extends SelfTestError {
  readonly _tag = "SelfTestError" as const;
  readonly code = "SELF_TEST_VERIFICATION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly verifierName: string;
  readonly failedAssertions: readonly FailedAssertionDetail[];
  readonly report: SelfTestReportRef;

  constructor(
    verifierName: string,
    failedAssertions: readonly FailedAssertionDetail[],
    report: SelfTestReportRef,
  ) {
    const count = failedAssertions.length;
    super(
      `Verification failed: ${verifierName} — ${count} assertion${count === 1 ? "" : "s"} failed`,
    );
    const entry = ERROR_CATALOG.SELF_TEST_VERIFICATION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.verifierName = verifierName;
    this.failedAssertions = failedAssertions;
    this.report = report;
  }
}

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when a self-test verifier exceeds its timeout.
 */
export class SelfTestTimeoutError extends SelfTestError {
  readonly _tag = "SelfTestError" as const;
  readonly code = "SELF_TEST_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly verifierName: string;
  readonly timeoutMs: number;
  readonly elapsedMs: number;

  constructor(verifierName: string, timeoutMs: number, elapsedMs: number) {
    super(`Self-test timeout: ${verifierName} exceeded ${timeoutMs}ms (elapsed: ${elapsedMs}ms)`);
    const entry = ERROR_CATALOG.SELF_TEST_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.verifierName = verifierName;
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
  }
}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the self-test configuration is invalid.
 */
export class SelfTestConfigurationInvalidError extends SelfTestError {
  readonly _tag = "SelfTestError" as const;
  readonly code = "SELF_TEST_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Invalid self-test configuration: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.SELF_TEST_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}
