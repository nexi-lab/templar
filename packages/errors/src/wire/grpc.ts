/**
 * gRPC Error Model (Google AIP-193)
 * https://google.aip.dev/193
 *
 * Standard wire format for gRPC error responses
 */

import { z } from "zod";

/**
 * gRPC canonical status codes
 * https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 */
export const GRPC_STATUS_CODES = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

export type GrpcStatusCodeValue = (typeof GRPC_STATUS_CODES)[keyof typeof GRPC_STATUS_CODES];

/**
 * gRPC Status structure
 */
export interface GrpcStatus {
  /**
   * Canonical gRPC status code (0-16)
   */
  code: GrpcStatusCodeValue;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Array of error detail messages (encoded as Any)
   */
  details: GrpcErrorDetail[];
}

/**
 * gRPC ErrorInfo detail (AIP-193)
 */
export interface GrpcErrorDetail {
  /**
   * Type URL for the detail message
   * Example: "type.googleapis.com/google.rpc.ErrorInfo"
   */
  "@type": string;

  /**
   * Machine-readable reason code (UPPER_SNAKE_CASE)
   * Example: "RESOURCE_NOT_FOUND", "QUOTA_EXCEEDED"
   */
  reason: string;

  /**
   * Domain that owns this error
   * Example: "auth.templar.com", "agents.templar.com"
   */
  domain: string;

  /**
   * Additional structured metadata
   */
  metadata: Record<string, string>;
}

/**
 * Well-known type URLs for gRPC error details
 */
export const GRPC_ERROR_TYPES = {
  ERROR_INFO: "type.googleapis.com/google.rpc.ErrorInfo",
  RETRY_INFO: "type.googleapis.com/google.rpc.RetryInfo",
  DEBUG_INFO: "type.googleapis.com/google.rpc.DebugInfo",
  QUOTA_FAILURE: "type.googleapis.com/google.rpc.QuotaFailure",
  PRECONDITION_FAILURE: "type.googleapis.com/google.rpc.PreconditionFailure",
  BAD_REQUEST: "type.googleapis.com/google.rpc.BadRequest",
} as const;

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for gRPC status code
 */
export const GrpcStatusCodeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
  z.literal(15),
  z.literal(16),
]);

/**
 * Zod schema for gRPC ErrorInfo detail
 */
export const GrpcErrorDetailSchema = z.object({
  "@type": z.string(),
  reason: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Reason must be UPPER_SNAKE_CASE"),
  domain: z.string(),
  metadata: z.record(z.string()),
});

/**
 * Zod schema for gRPC Status
 */
export const GrpcStatusSchema = z.object({
  code: GrpcStatusCodeSchema,
  message: z.string(),
  details: z.array(GrpcErrorDetailSchema),
});

/**
 * Type inferred from Zod schema
 */
export type GrpcStatusValidated = z.infer<typeof GrpcStatusSchema>;

/**
 * Map gRPC status code name to numeric value
 */
export function getGrpcStatusCode(name: keyof typeof GRPC_STATUS_CODES): GrpcStatusCodeValue {
  return GRPC_STATUS_CODES[name];
}

/**
 * Map numeric gRPC status code to name
 */
export function getGrpcStatusName(code: GrpcStatusCodeValue): keyof typeof GRPC_STATUS_CODES | undefined {
  const entry = Object.entries(GRPC_STATUS_CODES).find(([, value]) => value === code);
  return entry ? (entry[0] as keyof typeof GRPC_STATUS_CODES) : undefined;
}
