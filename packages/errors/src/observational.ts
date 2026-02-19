import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all observational memory errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for Observational Memory errors.
 *
 * Enables generic catch: `if (e instanceof ObservationalError)`
 * while specific subclasses allow precise handling.
 */
export abstract class ObservationalError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the observational memory middleware configuration is invalid.
 */
export class ObservationalConfigurationError extends ObservationalError {
  readonly _tag = "ObservationalError" as const;
  readonly code = "OBSERVATIONAL_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Invalid observational memory configuration: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.OBSERVATIONAL_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}

// ---------------------------------------------------------------------------
// Observation extraction failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the LLM observation extraction call fails.
 */
export class ObservationExtractionError extends ObservationalError {
  readonly _tag = "ObservationalError" as const;
  readonly code = "OBSERVATIONAL_EXTRACTION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Observation extraction failed: ${message}`);
    const entry = ERROR_CATALOG.OBSERVATIONAL_EXTRACTION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Reflection synthesis failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the reflector LLM call fails during observation synthesis.
 */
export class ObservationalReflectionError extends ObservationalError {
  readonly _tag = "ObservationalError" as const;
  readonly code = "OBSERVATIONAL_REFLECTION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Observation reflection failed: ${message}`);
    const entry = ERROR_CATALOG.OBSERVATIONAL_REFLECTION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
