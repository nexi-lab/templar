/**
 * Error serialization and deserialization
 *
 * Converts between domain errors (TemplarError) and wire formats:
 * - RFC 9457 ProblemDetails (REST/HTTP)
 * - gRPC Status (gRPC)
 * - WebSocket error messages
 *
 * Uses the catalog's baseType field for lossless round-trip reconstruction
 * of all error codes through any wire format.
 */

import { TemplarError } from "./base.js";
import { ConflictError } from "./bases/conflict-error.js";
import { ExternalError } from "./bases/external-error.js";
import { InternalError } from "./bases/internal-error.js";
import { NotFoundError } from "./bases/not-found-error.js";
import { PermissionError } from "./bases/permission-error.js";
import { RateLimitError } from "./bases/rate-limit-error.js";
import { TimeoutError } from "./bases/timeout-error.js";
import { ValidationError } from "./bases/validation-error.js";
import { type BaseErrorType, type CodesForBase, ERROR_CATALOG, type ErrorCode } from "./catalog.js";
import type { ValidationIssue } from "./types.js";
import { isValidErrorCode, wrapError } from "./utils.js";
import {
  GRPC_ERROR_TYPES,
  GRPC_STATUS_CODES,
  type GrpcErrorDetail,
  type GrpcStatus,
  GrpcStatusSchema,
} from "./wire/grpc.js";
import { type ProblemDetails, ProblemDetailsSchema } from "./wire/rfc9457.js";
import { type WebSocketErrorMessage, WebSocketErrorMessageSchema } from "./wire/websocket.js";

// ============================================================================
// RFC 9457 SERIALIZATION
// ============================================================================

/**
 * Serialize a TemplarError to RFC 9457 ProblemDetails format.
 * Uses `.code` as the RFC 9457 `type` discriminator.
 */
export function serializeToRFC9457(error: TemplarError): ProblemDetails {
  const problemDetails: ProblemDetails = {
    type: `/errors/${error.code}`,
    title: ERROR_CATALOG[error.code].title,
    status: error.httpStatus,
    detail: error.message,
    code: error.code,
    domain: error.domain,
    timestamp: error.timestamp.toISOString(),
    traceId: error.traceId,
    metadata: error.metadata,
  };

  // Add validation issues for ValidationError
  if (error instanceof ValidationError && error.issues.length > 0) {
    problemDetails.errors = error.issues.map((issue) => ({
      field: issue.field,
      message: issue.message,
      code: issue.code,
      value: issue.value,
    }));
  }

  return problemDetails;
}

/**
 * Deserialize RFC 9457 ProblemDetails to TemplarError.
 * Validates the wire format with Zod and reconstructs the appropriate base type.
 */
export function deserializeFromRFC9457(raw: unknown): TemplarError {
  const parsed = ProblemDetailsSchema.parse(raw);

  if (!parsed.code || !isValidErrorCode(parsed.code)) {
    return new InternalError(
      parsed.detail || parsed.title || "Unknown error",
      parsed.metadata,
      parsed.traceId,
    );
  }

  const code = parsed.code as ErrorCode;
  return reconstructError(code, parsed);
}

/**
 * Narrow an ErrorCode to the codes belonging to a specific base type.
 * The switch on `entry.baseType` guarantees correctness at runtime;
 * this helper makes the cast explicit and grep-able.
 */
function narrowCode<B extends BaseErrorType>(code: ErrorCode, _baseType: B): CodesForBase<B> {
  return code as CodesForBase<B>;
}

/** Compile-time exhaustiveness guard */
function assertNever(value: never): never {
  throw new Error(`Unexpected base type: ${value}`);
}

/**
 * Reconstruct a TemplarError from wire format data using the catalog's baseType.
 * Handles ALL codes losslessly — no default fallback to InternalError.
 */
function reconstructError(code: ErrorCode, data: ProblemDetails): TemplarError {
  const entry = ERROR_CATALOG[code];
  const baseType = entry.baseType;
  const message = data.detail || entry.title;
  const metadata = data.metadata;
  const traceId = data.traceId;

  switch (baseType) {
    case "ValidationError": {
      const issues: ValidationIssue[] = (data.errors ?? []).map((e) => ({
        field: e.field,
        message: e.message,
        code: e.code,
        value: e.value,
      }));
      return new ValidationError({
        code: narrowCode(code, "ValidationError"),
        message,
        metadata,
        traceId,
        ...(issues.length > 0 ? { issues } : {}),
      });
    }
    case "NotFoundError":
      return new NotFoundError({
        code: narrowCode(code, "NotFoundError"),
        message,
        metadata,
        traceId,
      });
    case "PermissionError":
      return new PermissionError({
        code: narrowCode(code, "PermissionError"),
        message,
        metadata,
        traceId,
      });
    case "ConflictError":
      return new ConflictError({
        code: narrowCode(code, "ConflictError"),
        message,
        metadata,
        traceId,
      });
    case "RateLimitError":
      return new RateLimitError({
        code: narrowCode(code, "RateLimitError"),
        message,
        metadata,
        traceId,
      });
    case "TimeoutError":
      return new TimeoutError({
        code: narrowCode(code, "TimeoutError"),
        message,
        metadata,
        traceId,
      });
    case "ExternalError":
      return new ExternalError({
        code: narrowCode(code, "ExternalError"),
        message,
        metadata,
        traceId,
      });
    case "InternalError":
      return new InternalError({
        code: narrowCode(code, "InternalError"),
        message,
        metadata,
        traceId,
      });
    default:
      return assertNever(baseType);
  }
}

// ============================================================================
// GRPC SERIALIZATION
// ============================================================================

/**
 * Serialize a TemplarError to gRPC Status format
 */
export function serializeToGrpc(error: TemplarError): GrpcStatus {
  const catalogEntry = ERROR_CATALOG[error.code];
  const grpcCodeValue = GRPC_STATUS_CODES[catalogEntry.grpcCode as keyof typeof GRPC_STATUS_CODES];

  const errorDetail: GrpcErrorDetail = {
    "@type": GRPC_ERROR_TYPES.ERROR_INFO,
    reason: error.code,
    domain: `${error.domain}.templar.com`,
    metadata: {
      ...error.metadata,
      ...(error.traceId ? { traceId: error.traceId } : {}),
      timestamp: error.timestamp.toISOString(),
    },
  };

  return {
    code: grpcCodeValue,
    message: error.message,
    details: [errorDetail],
  };
}

/**
 * Deserialize gRPC Status to TemplarError
 */
export function deserializeFromGrpc(raw: unknown): TemplarError {
  const parsed = GrpcStatusSchema.parse(raw);
  const errorInfo = parsed.details.find((d) => d["@type"] === GRPC_ERROR_TYPES.ERROR_INFO);

  if (!errorInfo || !isValidErrorCode(errorInfo.reason)) {
    return new InternalError(
      parsed.message,
      { grpcCode: String(parsed.code) },
      errorInfo?.metadata.traceId,
    );
  }

  const code = errorInfo.reason as ErrorCode;
  const { traceId, ...metadata } = errorInfo.metadata;

  const problemDetails: ProblemDetails = {
    type: `/errors/${code}`,
    title: ERROR_CATALOG[code].title,
    status: ERROR_CATALOG[code].httpStatus,
    detail: parsed.message,
    code,
    domain: ERROR_CATALOG[code].domain,
    metadata,
    traceId,
  };

  return reconstructError(code, problemDetails);
}

// ============================================================================
// WEBSOCKET SERIALIZATION
// ============================================================================

/**
 * Serialize a TemplarError to WebSocket error message format
 */
export function serializeToWebSocket(
  error: TemplarError,
  requestId?: string,
): WebSocketErrorMessage {
  return {
    type: "error",
    requestId,
    error: serializeToRFC9457(error),
    timestamp: error.timestamp.toISOString(),
  };
}

/**
 * Deserialize WebSocket error message to TemplarError
 */
export function deserializeFromWebSocket(raw: unknown): TemplarError {
  const parsed = WebSocketErrorMessageSchema.parse(raw);
  return deserializeFromRFC9457(parsed.error);
}

// ============================================================================
// GENERIC SERIALIZATION
// ============================================================================

/**
 * Serialize any error (including non-TemplarError) to RFC 9457 format.
 * Wraps unknown errors in InternalError first.
 */
export function serializeError(error: unknown, traceId?: string): ProblemDetails {
  const templarError = error instanceof TemplarError ? error : wrapError(error, traceId);
  return serializeToRFC9457(templarError);
}

/**
 * Safe deserialization that returns InternalError if parsing fails
 */
export function safeDeserialize(
  raw: unknown,
  format: "rfc9457" | "grpc" | "websocket",
): TemplarError {
  try {
    switch (format) {
      case "rfc9457":
        return deserializeFromRFC9457(raw);
      case "grpc":
        return deserializeFromGrpc(raw);
      case "websocket":
        return deserializeFromWebSocket(raw);
    }
  } catch (err) {
    return new InternalError("Failed to deserialize error from wire format", {
      format,
      parseError: String(err),
    });
  }
}
