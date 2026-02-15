/**
 * @templar/errors
 *
 * Shared error taxonomy for Templar AI Agent Execution Engine
 *
 * The error system is built on 8 behavioral base types:
 * ValidationError, NotFoundError, PermissionError, ConflictError,
 * RateLimitError, TimeoutError, ExternalError, InternalError
 *
 * Each error carries a `.code` from the catalog that discriminates
 * the specific error condition. Use `error.code === "XXX"` for
 * fine-grained matching, or `instanceof BaseType` for category matching.
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

export { type ErrorJSON, isError, isTemplarError, TemplarError } from "./base.js";

export {
  type BaseErrorType,
  type CodesForBase,
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
// 8 BASE ERROR TYPES (new consolidated hierarchy)
// ============================================================================

export { ConflictError } from "./bases/conflict-error.js";
export { ExternalError } from "./bases/external-error.js";
export { InternalError } from "./bases/internal-error.js";
export { NotFoundError } from "./bases/not-found-error.js";
export { PermissionError } from "./bases/permission-error.js";
export { RateLimitError } from "./bases/rate-limit-error.js";
export { TimeoutError } from "./bases/timeout-error.js";
export { ValidationError } from "./bases/validation-error.js";

// ============================================================================
// TYPE INFRASTRUCTURE
// ============================================================================

export type {
  ConflictCodes,
  ExternalCodes,
  InternalCodes,
  NotFoundCodes,
  PermissionCodes,
  RateLimitCodes,
  TemplarErrorOptions,
  TimeoutCodes,
  ValidationCodes,
  ValidationIssue,
} from "./types.js";

// ============================================================================
// TYPE GUARDS
// ============================================================================

export {
  hasCode,
  isConflictError,
  isExpectedError,
  isExternalError,
  isInternalError,
  isNotFoundError,
  isPermissionError,
  isRateLimitError,
  isTimeoutError,
  isValidationError,
} from "./guards.js";

// ============================================================================
// LEGACY ERROR CLASSES (backward compatibility — all @deprecated)
// ============================================================================

export {
  AgentConfigurationError,
  AgentExecutionError,
  AgentInvalidStateError,
  AgentNotFoundError,
  AgentTimeoutError,
  AguiConnectionLimitReachedError,
  AguiEncodingFailedError,
  AguiInvalidInputError,
  AguiRunFailedError,
  AguiRunTimeoutError,
  AguiStreamInterruptedError,
  AlreadyExistsError,
  AuditBatchWriteError,
  AuditBufferOverflowError,
  AuditConfigurationError,
  AuditRedactionError,
  AuditWriteError,
  BudgetExhaustedError,
  CapabilityNotSupportedError,
  ChannelAuthExpiredError,
  ChannelAuthRequiredError,
  ChannelLoadError,
  ChannelNotFoundError,
  ChannelSendError,
  ChannelSessionReplacedError,
  DeploymentConfigError,
  DeploymentError,
  DeploymentNotFoundError,
  ForbiddenError,
  GatewayAgentNotFoundError,
  GatewayAuthFailedError,
  GatewayConfigInvalidError,
  GatewayConfigReloadFailedError,
  GatewayHeartbeatTimeoutError,
  GatewayLaneOverflowError,
  GatewayNodeAlreadyRegisteredError,
  GatewayNodeNotFoundError,
  GatewaySessionExpiredError,
  GatewaySessionInvalidTransitionError,
  HookConfigurationError,
  HookExecutionError,
  HookReentrancyError,
  HookTimeoutError,
  InsufficientScopeError,
  InvalidFormatError,
  LegacyInternalError,
  LegacyNotFoundError,
  LegacyTimeoutError,
  LegacyValidationError,
  ManifestFileNotFoundError,
  ManifestInterpolationError,
  ManifestParseError,
  ManifestSchemaError,
  ManifestValidationError,
  McpConnectionFailedError,
  McpInitializationFailedError,
  McpResourceNotFoundError,
  McpResourceReadFailedError,
  McpServerDisconnectedError,
  McpToolCallFailedError,
  McpToolNotFoundError,
  McpTransportError,
  MemoryBatchError,
  MemoryConfigurationError,
  MemoryNotFoundError,
  MemorySearchError,
  MemoryStoreError,
  NexusClientError,
  NodeAuthFailureError,
  NodeConnectionTimeoutError,
  NodeFrameTooLargeError,
  NodeHandlerError,
  NodeReconnectExhaustedError,
  NodeRegistrationTimeoutError,
  NodeStartError,
  NodeStoppedError,
  NotImplementedError,
  OutOfRangeError,
  PayBalanceCheckError,
  PayConfigurationError,
  PayloadTooLargeError,
  PayReservationExpiredError,
  PayTransferError,
  PermissionCheckFailedError,
  PermissionConfigurationError,
  PermissionDeniedError,
  PermissionGrantFailedError,
  QuotaExceededError,
  RateLimitExceededError,
  RequiredFieldError,
  ResourceConflictError,
  ResourceGoneError,
  SanitizeConfigurationError,
  SanitizeContentBlockedError,
  SanitizeRuleFailedError,
  ServiceUnavailableError,
  SkillNotFoundError,
  SkillParseError,
  SkillValidationError,
  TemplarConfigError,
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  WorkflowExecutionError,
  WorkflowInvalidStateError,
  WorkflowNotFoundError,
  WorkflowStepError,
} from "./legacy.js";

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
