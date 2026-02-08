/**
 * @templar/errors
 *
 * Shared error taxonomy for Templar AI Agent Execution Engine
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

export { TemplarError, isTemplarError, isError, type ErrorJSON } from "./base.js";

export {
  ERROR_CATALOG,
  type ErrorCode,
  type ErrorCatalogEntry,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

export {
  getCatalogEntry,
  isValidErrorCode,
  getAllErrorCodes,
  getErrorCodesByDomain,
  wrapError,
  getErrorMessage,
  isErrorStatus,
  isClientError,
  isServerError,
  validateCatalog,
} from "./utils.js";

// ============================================================================
// ERROR CLASSES
// ============================================================================

// Internal errors
export { InternalError, NotImplementedError, ServiceUnavailableError, TimeoutError } from "./classes.js";

// Auth errors
export {
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  InsufficientScopeError,
  ForbiddenError,
} from "./classes.js";

// Resource errors
export {
  NotFoundError,
  AlreadyExistsError,
  ResourceConflictError,
  ResourceGoneError,
} from "./classes.js";

// Validation errors
export {
  ValidationError,
  RequiredFieldError,
  InvalidFormatError,
  OutOfRangeError,
  type ValidationIssue,
} from "./classes.js";

// Agent errors
export {
  AgentNotFoundError,
  AgentExecutionError,
  AgentTimeoutError,
  AgentInvalidStateError,
  AgentConfigurationError,
} from "./classes.js";

// Workflow errors
export {
  WorkflowNotFoundError,
  WorkflowExecutionError,
  WorkflowInvalidStateError,
  WorkflowStepError,
} from "./classes.js";

// Deployment errors
export {
  DeploymentError,
  DeploymentNotFoundError,
  DeploymentConfigError,
} from "./classes.js";

// Quota/Rate limit errors
export {
  QuotaExceededError,
  RateLimitExceededError,
  PayloadTooLargeError,
} from "./classes.js";

// ============================================================================
// WIRE FORMATS
// ============================================================================

// RFC 9457 (REST/HTTP)
export {
  type ProblemDetails,
  type ValidationIssue as ProblemDetailsValidationIssue,
  ProblemDetailsSchema,
  ProblemDetailsPartialSchema,
  ValidationIssueSchema,
} from "./wire/rfc9457.js";

// gRPC
export {
  type GrpcStatus,
  type GrpcErrorDetail,
  type GrpcStatusCodeValue,
  GRPC_STATUS_CODES,
  GRPC_ERROR_TYPES,
  GrpcStatusSchema,
  GrpcErrorDetailSchema,
  GrpcStatusCodeSchema,
  getGrpcStatusCode,
  getGrpcStatusName,
} from "./wire/grpc.js";

// WebSocket
export {
  type WebSocketErrorMessage,
  type WebSocketSuccessMessage,
  type WebSocketMessage,
  WebSocketErrorMessageSchema,
  WebSocketSuccessMessageSchema,
  WebSocketMessageSchema,
} from "./wire/websocket.js";

// ============================================================================
// SERIALIZATION
// ============================================================================

export {
  serializeToRFC9457,
  deserializeFromRFC9457,
  serializeToGrpc,
  deserializeFromGrpc,
  serializeToWebSocket,
  deserializeFromWebSocket,
  serializeError,
  safeDeserialize,
} from "./serialization.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/errors";
export const PACKAGE_VERSION = "0.1.0";
