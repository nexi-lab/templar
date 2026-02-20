import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Shared issue type for guard validation results
// ---------------------------------------------------------------------------

export interface GuardIssue {
  readonly guard: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code: string;
  readonly severity: "error" | "warning";
}

// ---------------------------------------------------------------------------
// Base class for all guardrail errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for guardrail errors.
 *
 * Enables generic catch: `if (e instanceof GuardrailError)`
 * while specific subclasses allow precise handling.
 */
export abstract class GuardrailError extends TemplarError {}

// ---------------------------------------------------------------------------
// Guardrail configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the guardrails middleware configuration is invalid.
 */
export class GuardrailConfigurationError extends GuardrailError {
  readonly _tag = "ValidationError" as const;
  readonly code = "GUARDRAIL_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Invalid guardrail configuration: ${message}`);
    const entry = ERROR_CATALOG.GUARDRAIL_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Guardrail schema validation failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the LLM output fails Zod schema validation.
 */
export class GuardrailSchemaError extends GuardrailError {
  readonly _tag = "ValidationError" as const;
  readonly code = "GUARDRAIL_SCHEMA_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly issues: readonly GuardIssue[];

  constructor(message: string, issues: readonly GuardIssue[]) {
    super(`Guardrail schema validation failed: ${message}`);
    const entry = ERROR_CATALOG.GUARDRAIL_SCHEMA_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Guardrail retry exhausted
// ---------------------------------------------------------------------------

/**
 * Thrown when all retry attempts fail to produce valid output.
 */
export class GuardrailRetryExhaustedError extends GuardrailError {
  readonly _tag = "ValidationError" as const;
  readonly code = "GUARDRAIL_RETRY_EXHAUSTED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly attempts: number;
  readonly lastIssues: readonly GuardIssue[];

  constructor(attempts: number, lastIssues: readonly GuardIssue[]) {
    super(`Guardrail validation failed after ${attempts} attempts`);
    const entry = ERROR_CATALOG.GUARDRAIL_RETRY_EXHAUSTED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.attempts = attempts;
    this.lastIssues = lastIssues;
  }
}

// ---------------------------------------------------------------------------
// Guardrail evidence missing
// ---------------------------------------------------------------------------

/**
 * Thrown when the output is missing required evidence or citations.
 */
export class GuardrailEvidenceError extends GuardrailError {
  readonly _tag = "ValidationError" as const;
  readonly code = "GUARDRAIL_EVIDENCE_MISSING" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly missingFields: readonly string[];

  constructor(missingFields: readonly string[]) {
    super(`Missing required evidence fields: ${missingFields.join(", ")}`);
    const entry = ERROR_CATALOG.GUARDRAIL_EVIDENCE_MISSING;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.missingFields = missingFields;
  }
}
