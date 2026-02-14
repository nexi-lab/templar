/**
 * Type guards for the 8 base error types + code-level discrimination.
 */

import type { TemplarError } from "./base.js";
import { ConflictError } from "./bases/conflict-error.js";
import { ExternalError } from "./bases/external-error.js";
import { InternalError } from "./bases/internal-error.js";
import { NotFoundError } from "./bases/not-found-error.js";
import { PermissionError } from "./bases/permission-error.js";
import { RateLimitError } from "./bases/rate-limit-error.js";
import { TimeoutError } from "./bases/timeout-error.js";
import { ValidationError } from "./bases/validation-error.js";
import type { ErrorCode } from "./catalog.js";

/** Check if an error is a ValidationError (bad input, config) */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/** Check if an error is a NotFoundError (resource missing) */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/** Check if an error is a PermissionError (auth/authz failure) */
export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError;
}

/** Check if an error is a ConflictError (state conflict) */
export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

/** Check if an error is a RateLimitError (resource exhaustion) */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/** Check if an error is a TimeoutError (deadline exceeded) */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/** Check if an error is an ExternalError (dependency/runtime failure) */
export function isExternalError(error: unknown): error is ExternalError {
  return error instanceof ExternalError;
}

/** Check if an error is an InternalError (bug/unimplemented) */
export function isInternalError(error: unknown): error is InternalError {
  return error instanceof InternalError;
}

/**
 * Check if a TemplarError has a specific error code.
 * Narrows the type to include the specific code literal.
 */
export function hasCode<C extends ErrorCode>(
  error: TemplarError,
  code: C,
): error is TemplarError & { readonly code: C } {
  return error.code === code;
}

/**
 * Check if an error represents an expected condition (4xx-class).
 * Returns false for non-TemplarError values.
 */
export function isExpectedError(error: unknown): boolean {
  if (error !== null && error !== undefined && typeof error === "object" && "isExpected" in error) {
    return (error as TemplarError).isExpected;
  }
  return false;
}
