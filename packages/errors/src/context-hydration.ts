import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all context hydration errors (#59)
// ---------------------------------------------------------------------------

/**
 * Abstract base class for context hydration errors.
 *
 * Enables generic catch: `if (e instanceof ContextHydrationError)`
 * while specific subclasses allow precise handling.
 */
export abstract class ContextHydrationError extends TemplarError {}

// ---------------------------------------------------------------------------
// Global hydration timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when the global hydration timeout is exceeded and failureStrategy is "abort".
 */
export class HydrationTimeoutError extends ContextHydrationError {
  readonly _tag = "ContextHydrationError" as const;
  readonly code = "CONTEXT_HYDRATION_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Context hydration exceeded global timeout of ${timeoutMs}ms`);
    const entry = ERROR_CATALOG.CONTEXT_HYDRATION_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.timeoutMs = timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Source resolution failure
// ---------------------------------------------------------------------------

/**
 * Thrown when a critical context source fails and failureStrategy is "abort".
 */
export class HydrationSourceFailedError extends ContextHydrationError {
  readonly _tag = "ContextHydrationError" as const;
  readonly code = "CONTEXT_SOURCE_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly sourceType: string;
  readonly reason: string;

  constructor(sourceType: string, reason: string) {
    super(`Context source "${sourceType}" failed: ${reason}`);
    const entry = ERROR_CATALOG.CONTEXT_SOURCE_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.sourceType = sourceType;
    this.reason = reason;
  }
}
