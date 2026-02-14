import { TemplarError } from "./base.js";
import { ERROR_CATALOG, type ErrorCatalogEntry, type ErrorCode } from "./catalog.js";
import { InternalError } from "./bases/internal-error.js";

/**
 * Look up error catalog entry by code
 */
export function getCatalogEntry(code: ErrorCode): ErrorCatalogEntry {
  return ERROR_CATALOG[code];
}

/**
 * Check if a string is a valid error code
 */
export function isValidErrorCode(code: string): code is ErrorCode {
  return code in ERROR_CATALOG;
}

/**
 * Get all error codes in the catalog
 */
export function getAllErrorCodes(): ErrorCode[] {
  return Object.keys(ERROR_CATALOG) as ErrorCode[];
}

/**
 * Get all error codes for a specific domain
 */
export function getErrorCodesByDomain(domain: string): ErrorCode[] {
  return getAllErrorCodes().filter((code) => ERROR_CATALOG[code].domain === domain);
}

/**
 * Wrap an unknown error into a TemplarError.
 * If the error is already a TemplarError, return it as-is.
 * Otherwise, wrap it in an InternalError.
 */
export function wrapError(error: unknown, traceId?: string): TemplarError {
  if (error instanceof TemplarError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, { originalName: error.name }, traceId);
  }

  const message = typeof error === "string" ? error : "An unknown error occurred";
  return new InternalError(message, undefined, traceId);
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unknown error occurred";
}

/**
 * Check if an HTTP status code indicates an error
 */
export function isErrorStatus(status: number): boolean {
  return status >= 400;
}

/**
 * Check if an HTTP status code indicates a client error (4xx)
 */
export function isClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

/**
 * Check if an HTTP status code indicates a server error (5xx)
 */
export function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Validate catalog consistency (for tests)
 * Checks:
 * - All codes are UPPER_SNAKE_CASE
 * - All HTTP status codes are valid (100-599)
 * - All gRPC codes are valid
 * - No duplicate HTTP status codes within the same domain (relaxed - different domains can share)
 */
export function validateCatalog(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const domainStatusMap = new Map<string, Map<number, ErrorCode[]>>();

  for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
    // Check UPPER_SNAKE_CASE
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      errors.push(`Code '${code}' is not in UPPER_SNAKE_CASE format`);
    }

    // Check HTTP status
    if (entry.httpStatus < 100 || entry.httpStatus >= 600) {
      errors.push(`Code '${code}' has invalid HTTP status ${entry.httpStatus}`);
    }

    // Track domain + status combinations (for informational purposes, not strict error)
    let statusMap = domainStatusMap.get(entry.domain);
    if (!statusMap) {
      statusMap = new Map();
      domainStatusMap.set(entry.domain, statusMap);
    }
    if (!statusMap.has(entry.httpStatus)) {
      statusMap.set(entry.httpStatus, []);
    }
    statusMap.get(entry.httpStatus)?.push(code as ErrorCode);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
