import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all ACE errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for ACE (Adaptive Context Engine) errors.
 *
 * Enables generic catch: `if (e instanceof AceError)`
 * while specific subclasses allow precise handling.
 */
export abstract class AceError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the ACE middleware configuration is invalid.
 */
export class AceConfigurationError extends AceError {
  readonly _tag = "AceError" as const;
  readonly code = "ACE_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Invalid ACE configuration: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.ACE_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}

// ---------------------------------------------------------------------------
// Trajectory operation failed
// ---------------------------------------------------------------------------

/**
 * Thrown when a trajectory start/log/complete operation fails.
 */
export class TrajectoryError extends AceError {
  readonly _tag = "AceError" as const;
  readonly code = "ACE_TRAJECTORY_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`Trajectory ${operation} failed: ${message}`);
    const entry = ERROR_CATALOG.ACE_TRAJECTORY_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.operation = operation;
  }
}

// ---------------------------------------------------------------------------
// Playbook operation failed
// ---------------------------------------------------------------------------

/**
 * Thrown when a playbook load or query operation fails.
 */
export class PlaybookError extends AceError {
  readonly _tag = "AceError" as const;
  readonly code = "ACE_PLAYBOOK_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Playbook operation failed: ${message}`);
    const entry = ERROR_CATALOG.ACE_PLAYBOOK_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Reflection failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the reflection LLM call fails during post-session analysis.
 */
export class ReflectionError extends AceError {
  readonly _tag = "AceError" as const;
  readonly code = "ACE_REFLECTION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Reflection failed: ${message}`);
    const entry = ERROR_CATALOG.ACE_REFLECTION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
