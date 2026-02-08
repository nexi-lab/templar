/**
 * Error serialization and deserialization
 *
 * Converts between domain errors (TemplarError) and wire formats:
 * - RFC 9457 ProblemDetails (REST/HTTP)
 * - gRPC Status (gRPC)
 * - WebSocket error messages
 */

import { TemplarError } from "./base.js";
import { ERROR_CATALOG, type ErrorCode } from "./catalog.js";
import {
  InternalError,
  NotFoundError,
  ValidationError,
  AgentNotFoundError,
  AgentExecutionError,
  WorkflowNotFoundError,
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  InsufficientScopeError,
  ForbiddenError,
  AlreadyExistsError,
  type ValidationIssue,
} from "./classes.js";
import {
  ProblemDetailsSchema,
  type ProblemDetails,
} from "./wire/rfc9457.js";
import {
  GrpcStatusSchema,
  type GrpcStatus,
  type GrpcErrorDetail,
  GRPC_ERROR_TYPES,
  GRPC_STATUS_CODES,
} from "./wire/grpc.js";
import {
  WebSocketErrorMessageSchema,
  type WebSocketErrorMessage,
} from "./wire/websocket.js";
import { isValidErrorCode, wrapError } from "./utils.js";

// ============================================================================
// RFC 9457 SERIALIZATION
// ============================================================================

/**
 * Serialize a TemplarError to RFC 9457 ProblemDetails format
 */
export function serializeToRFC9457(error: TemplarError): ProblemDetails {
  const problemDetails: ProblemDetails = {
    type: `/errors/${error._tag}`,
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
  if (error instanceof ValidationError) {
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
 * Deserialize RFC 9457 ProblemDetails to TemplarError
 * Validates the wire format with Zod and reconstructs the appropriate error class
 */
export function deserializeFromRFC9457(raw: unknown): TemplarError {
  // Validate wire format
  const parsed = ProblemDetailsSchema.parse(raw);

  // If no code provided or invalid, return InternalError
  if (!parsed.code || !isValidErrorCode(parsed.code)) {
    return new InternalError(
      parsed.detail || parsed.title || "Unknown error",
      parsed.metadata,
      parsed.traceId
    );
  }

  const code = parsed.code as ErrorCode;

  // Reconstruct appropriate error class based on code
  return reconstructError(code, parsed);
}

/**
 * Reconstruct a TemplarError from wire format data
 */
function reconstructError(code: ErrorCode, data: ProblemDetails): TemplarError {
  const message = data.detail || ERROR_CATALOG[code].title;
  const metadata = data.metadata;
  const traceId = data.traceId;

  // Reconstruct specific error types with their custom fields
  // This is a simplified reconstruction - in production you might want more sophisticated logic

  switch (code) {
    case "RESOURCE_NOT_FOUND":
      return new NotFoundError(
        metadata?.resourceType || "Resource",
        metadata?.resourceId || "unknown",
        metadata,
        traceId
      );

    case "AGENT_NOT_FOUND":
      return new AgentNotFoundError(metadata?.agentId || "unknown", metadata, traceId);

    case "WORKFLOW_NOT_FOUND":
      return new WorkflowNotFoundError(metadata?.workflowId || "unknown", metadata, traceId);

    case "VALIDATION_FAILED":
      const issues: ValidationIssue[] = (data.errors || []).map((e) => ({
        field: e.field,
        message: e.message,
        code: e.code,
        value: e.value,
      }));
      return new ValidationError(message, issues, metadata, traceId);

    case "AGENT_EXECUTION_FAILED":
      return new AgentExecutionError(
        metadata?.agentId || "unknown",
        message,
        undefined,
        metadata,
        traceId
      );

    case "WORKFLOW_EXECUTION_FAILED":
      return new WorkflowNotFoundError(metadata?.workflowId || "unknown", metadata, traceId);

    // Auth errors
    case "AUTH_TOKEN_EXPIRED":
      return new TokenExpiredError(message, metadata, traceId);

    case "AUTH_TOKEN_INVALID":
      return new TokenInvalidError(message, metadata, traceId);

    case "AUTH_TOKEN_MISSING":
      return new TokenMissingError(message, metadata, traceId);

    case "AUTH_INSUFFICIENT_SCOPE":
      return new InsufficientScopeError(message, [], [], metadata, traceId);

    case "AUTH_FORBIDDEN":
      return new ForbiddenError(message, metadata, traceId);

    // Resource errors
    case "RESOURCE_ALREADY_EXISTS":
      return new AlreadyExistsError(
        metadata?.resourceType || "Resource",
        metadata?.resourceId || "unknown",
        metadata,
        traceId
      );

    // For all other errors, create a generic InternalError
    // Note: This is a simplified approach. A production system might use
    // a factory pattern with a registry of error constructors.
    default:
      return new InternalError(message, { ...metadata, originalCode: code }, traceId);
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

  // Map grpc code string to numeric value
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
  // Validate wire format
  const parsed = GrpcStatusSchema.parse(raw);

  // Extract ErrorInfo detail (first one)
  const errorInfo = parsed.details.find((d) => d["@type"] === GRPC_ERROR_TYPES.ERROR_INFO);

  if (!errorInfo || !isValidErrorCode(errorInfo.reason)) {
    return new InternalError(
      parsed.message,
      { grpcCode: String(parsed.code) },
      errorInfo?.metadata.traceId
    );
  }

  const code = errorInfo.reason as ErrorCode;
  const metadata = { ...errorInfo.metadata };
  const traceId = metadata.traceId;
  delete metadata.traceId; // Remove traceId from metadata since it's a separate field

  // Convert to ProblemDetails format for reconstruction
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
  requestId?: string
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
  // Validate wire format
  const parsed = WebSocketErrorMessageSchema.parse(raw);

  // Deserialize the nested ProblemDetails
  return deserializeFromRFC9457(parsed.error);
}

// ============================================================================
// GENERIC SERIALIZATION
// ============================================================================

/**
 * Serialize any error (including non-TemplarError) to RFC 9457 format
 * Wraps unknown errors in InternalError first
 */
export function serializeError(error: unknown, traceId?: string): ProblemDetails {
  const templarError = error instanceof TemplarError ? error : wrapError(error, traceId);
  return serializeToRFC9457(templarError);
}

/**
 * Safe deserialization that returns InternalError if parsing fails
 */
export function safeDeserialize(raw: unknown, format: "rfc9457" | "grpc" | "websocket"): TemplarError {
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
    return new InternalError(
      "Failed to deserialize error from wire format",
      { format, parseError: String(err) }
    );
  }
}
