/**
 * Type infrastructure for the consolidated error system.
 *
 * Provides generic constraints, context maps, and construction options
 * for the 8 base error types.
 */

import type { BaseErrorType, CodesForBase, ErrorCode } from "./catalog.js";

// ============================================================================
// VALIDATION ISSUE
// ============================================================================

/**
 * Structured validation issue (field-level detail)
 */
export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

// ============================================================================
// ERROR CONSTRUCTION OPTIONS
// ============================================================================

/**
 * Options for constructing a base error type.
 * The code determines httpStatus, grpcCode, domain, and isExpected via catalog lookup.
 */
export interface TemplarErrorOptions<C extends ErrorCode> {
  code: C;
  message: string;
  metadata?: Record<string, string> | undefined;
  traceId?: string | undefined;
  cause?: Error | undefined;
}

// ============================================================================
// BASE ERROR UNION
// ============================================================================

// Re-export for convenience — forward-declared here, fully typed once bases are created.
// Consumers import this to get the 8-member discriminated union.
export type { BaseErrorType, CodesForBase };

/**
 * Union of error codes for each base type (convenience aliases)
 */
export type ValidationCodes = CodesForBase<"ValidationError">;
export type NotFoundCodes = CodesForBase<"NotFoundError">;
export type PermissionCodes = CodesForBase<"PermissionError">;
export type ConflictCodes = CodesForBase<"ConflictError">;
export type RateLimitCodes = CodesForBase<"RateLimitError">;
export type TimeoutCodes = CodesForBase<"TimeoutError">;
export type ExternalCodes = CodesForBase<"ExternalError">;
export type InternalCodes = CodesForBase<"InternalError">;
