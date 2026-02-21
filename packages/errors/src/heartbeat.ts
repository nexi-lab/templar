import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all heartbeat errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for heartbeat errors.
 *
 * Enables generic catch: `if (e instanceof HeartbeatError)`
 * while specific subclasses allow precise handling.
 */
export abstract class HeartbeatError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the heartbeat middleware configuration is invalid.
 */
export class HeartbeatConfigurationError extends HeartbeatError {
  readonly _tag = "ValidationError" as const;
  readonly code = "HEARTBEAT_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Invalid heartbeat configuration: ${message}`);
    const entry = ERROR_CATALOG.HEARTBEAT_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Evaluator failed — evaluator threw unexpectedly
// ---------------------------------------------------------------------------

/**
 * Thrown when a heartbeat evaluator throws an unexpected error.
 */
export class HeartbeatEvaluatorFailedError extends HeartbeatError {
  readonly _tag = "ExternalError" as const;
  readonly code = "HEARTBEAT_EVALUATOR_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly evaluatorName: string;

  constructor(evaluatorName: string, cause?: Error) {
    super(
      `Evaluator "${evaluatorName}" failed: ${cause?.message ?? "unknown error"}`,
      undefined,
      undefined,
      ...(cause ? [{ cause }] : []),
    );
    const entry = ERROR_CATALOG.HEARTBEAT_EVALUATOR_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.evaluatorName = evaluatorName;
  }
}

// ---------------------------------------------------------------------------
// Evaluator timeout — evaluator exceeded its timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when a heartbeat evaluator exceeds its per-evaluator timeout.
 */
export class HeartbeatEvaluatorTimeoutError extends HeartbeatError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "HEARTBEAT_EVALUATOR_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly evaluatorName: string;
  readonly timeoutMs: number;

  constructor(evaluatorName: string, timeoutMs: number) {
    super(
      `Evaluator "${evaluatorName}" exceeded timeout of ${timeoutMs}ms`,
    );
    const entry = ERROR_CATALOG.HEARTBEAT_EVALUATOR_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.evaluatorName = evaluatorName;
    this.timeoutMs = timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Pipeline failed — orchestration-level failure
// ---------------------------------------------------------------------------

/**
 * Thrown when the heartbeat evaluator pipeline fails at the orchestration level.
 */
export class HeartbeatPipelineFailedError extends HeartbeatError {
  readonly _tag = "InternalError" as const;
  readonly code = "HEARTBEAT_PIPELINE_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(
      `Heartbeat pipeline failed: ${message}`,
      undefined,
      undefined,
      ...(cause ? [{ cause }] : []),
    );
    const entry = ERROR_CATALOG.HEARTBEAT_PIPELINE_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
