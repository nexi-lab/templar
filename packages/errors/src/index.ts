/**
 * @templar/errors
 *
 * Shared error taxonomy for Templar AI Agent Execution Engine
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

export { type ErrorJSON, isError, isTemplarError, TemplarError } from "./base.js";

export {
  ERROR_CATALOG,
  type ErrorCatalogEntry,
  type ErrorCode,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

export {
  getAllErrorCodes,
  getCatalogEntry,
  getErrorCodesByDomain,
  getErrorMessage,
  isClientError,
  isErrorStatus,
  isServerError,
  isValidErrorCode,
  validateCatalog,
  wrapError,
} from "./utils.js";

// ============================================================================
// ERROR CLASSES
// ============================================================================

// Internal errors
// Auth errors
// Resource errors
// Validation errors
// Agent errors
// Workflow errors
// Deployment errors
// Quota/Rate limit errors
// Application-specific errors
// Channel errors
export {
  AgentConfigurationError,
  AgentExecutionError,
  AgentInvalidStateError,
  AgentNotFoundError,
  AgentTimeoutError,
  AlreadyExistsError,
  BudgetExhaustedError,
  ChannelLoadError,
  ChannelNotFoundError,
  DeploymentConfigError,
  DeploymentError,
  DeploymentNotFoundError,
  ForbiddenError,
  InsufficientScopeError,
  InternalError,
  InvalidFormatError,
  ManifestValidationError,
  MemoryBatchError,
  MemoryConfigurationError,
  MemoryNotFoundError,
  MemorySearchError,
  MemoryStoreError,
  NexusClientError,
  NotFoundError,
  NotImplementedError,
  OutOfRangeError,
  PayBalanceCheckError,
  PayConfigurationError,
  PayloadTooLargeError,
  PayReservationExpiredError,
  PayTransferError,
  QuotaExceededError,
  RateLimitExceededError,
  RequiredFieldError,
  ResourceConflictError,
  ResourceGoneError,
  ServiceUnavailableError,
  TemplarConfigError,
  TimeoutError,
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  ValidationError,
  type ValidationIssue,
  WorkflowExecutionError,
  WorkflowInvalidStateError,
  WorkflowNotFoundError,
  WorkflowStepError,
} from "./classes.js";

// ============================================================================
// WIRE FORMATS
// ============================================================================

// gRPC
export {
  GRPC_ERROR_TYPES,
  GRPC_STATUS_CODES,
  type GrpcErrorDetail,
  GrpcErrorDetailSchema,
  type GrpcStatus,
  GrpcStatusCodeSchema,
  type GrpcStatusCodeValue,
  GrpcStatusSchema,
  getGrpcStatusCode,
  getGrpcStatusName,
} from "./wire/grpc.js";
// RFC 9457 (REST/HTTP)
export {
  type ProblemDetails,
  ProblemDetailsPartialSchema,
  ProblemDetailsSchema,
  type ValidationIssue as ProblemDetailsValidationIssue,
  ValidationIssueSchema,
} from "./wire/rfc9457.js";

// WebSocket
export {
  type WebSocketErrorMessage,
  WebSocketErrorMessageSchema,
  type WebSocketMessage,
  WebSocketMessageSchema,
  type WebSocketSuccessMessage,
  WebSocketSuccessMessageSchema,
} from "./wire/websocket.js";

// ============================================================================
// SERIALIZATION
// ============================================================================

export {
  deserializeFromGrpc,
  deserializeFromRFC9457,
  deserializeFromWebSocket,
  safeDeserialize,
  serializeError,
  serializeToGrpc,
  serializeToRFC9457,
  serializeToWebSocket,
} from "./serialization.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/errors";
export const PACKAGE_VERSION = "0.1.0";
