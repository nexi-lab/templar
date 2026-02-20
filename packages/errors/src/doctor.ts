import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all doctor errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for doctor errors.
 *
 * Enables generic catch: `if (e instanceof DoctorError)`
 * while specific subclasses allow precise handling.
 */
export abstract class DoctorError extends TemplarError {}

// ---------------------------------------------------------------------------
// Doctor configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the doctor scan configuration is invalid.
 */
export class DoctorConfigurationError extends DoctorError {
  readonly _tag = "ValidationError" as const;
  readonly code = "DOCTOR_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Invalid doctor configuration: ${message}`);
    const entry = ERROR_CATALOG.DOCTOR_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Doctor check failed
// ---------------------------------------------------------------------------

/**
 * Thrown when a doctor security check throws an unexpected error.
 */
export class DoctorCheckFailedError extends DoctorError {
  readonly _tag = "InternalError" as const;
  readonly code = "DOCTOR_CHECK_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly checkName: string;

  constructor(checkName: string, message: string) {
    super(`Doctor check "${checkName}" failed: ${message}`);
    const entry = ERROR_CATALOG.DOCTOR_CHECK_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.checkName = checkName;
  }
}

// ---------------------------------------------------------------------------
// Doctor Nexus unavailable
// ---------------------------------------------------------------------------

/**
 * Thrown when the Nexus API is unavailable for multi-tenant checks.
 */
export class DoctorNexusUnavailableError extends DoctorError {
  readonly _tag = "ExternalError" as const;
  readonly code = "DOCTOR_NEXUS_UNAVAILABLE" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Nexus unavailable for doctor: ${message}`);
    const entry = ERROR_CATALOG.DOCTOR_NEXUS_UNAVAILABLE;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Doctor scan timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when the doctor security scan exceeds the configured timeout.
 */
export class DoctorScanTimeoutError extends DoctorError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "DOCTOR_SCAN_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Doctor scan timed out after ${timeoutMs}ms`);
    const entry = ERROR_CATALOG.DOCTOR_SCAN_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.timeoutMs = timeoutMs;
  }
}
