/**
 * RFC 9457 Problem Details for HTTP APIs
 * https://www.rfc-editor.org/rfc/rfc9457.html
 *
 * Standard wire format for REST/HTTP error responses
 */

import { z } from "zod";

/**
 * RFC 9457 Problem Details structure
 */
export interface ProblemDetails {
  /**
   * URI reference identifying the problem type
   * Example: "/errors/not-found" or "https://example.com/errors/not-found"
   */
  type: string;

  /**
   * Short, human-readable summary (should not change between occurrences)
   */
  title: string;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Human-readable explanation specific to this occurrence
   */
  detail?: string;

  /**
   * URI reference identifying this specific occurrence
   * Example: "/logs/abc123" or a correlation ID
   */
  instance?: string;

  // Extension members (Templar-specific)

  /**
   * Machine-readable error code from the catalog
   */
  code?: string;

  /**
   * Distributed trace ID for correlation
   */
  traceId?: string;

  /**
   * Timestamp when the error occurred (ISO 8601)
   */
  timestamp?: string;

  /**
   * Domain this error belongs to
   */
  domain?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, string>;

  /**
   * Nested validation errors (for validation failures)
   */
  errors?: ValidationIssue[];
}

/**
 * Validation issue structure
 */
export interface ValidationIssue {
  /**
   * Field name/path that failed validation
   */
  field: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Machine-readable error code
   */
  code: string;

  /**
   * The value that failed validation (optional)
   */
  value?: unknown;
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for ValidationIssue
 */
export const ValidationIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
  value: z.unknown().optional(),
});

/**
 * Zod schema for ProblemDetails with runtime validation
 */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
  traceId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  domain: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  errors: z.array(ValidationIssueSchema).optional(),
});

/**
 * Type inferred from Zod schema (for validation)
 */
export type ProblemDetailsValidated = z.infer<typeof ProblemDetailsSchema>;

/**
 * Partial schema for relaxed parsing (allows unknown fields)
 */
export const ProblemDetailsPartialSchema = ProblemDetailsSchema.passthrough();
