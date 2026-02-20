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
  getErrorCause,
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
// EXECUTION GUARD ERRORS — Loop detection and iteration limits (#151)
// ============================================================================

export {
  ExecutionGuardError,
  ExecutionTimeoutError,
  IterationLimitError,
  LoopDetectedError,
} from "./execution-guard.js";

// ============================================================================
// SPAWN GOVERNANCE ERRORS — Cross-agent spawn limits (#163)
// ============================================================================

export {
  SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
  SpawnGovernanceError,
  SpawnToolDeniedError,
} from "./spawn-governance.js";

// ============================================================================
// CONTEXT HYDRATION ERRORS — Deterministic context pre-loading (#59)
// ============================================================================

export {
  ContextHydrationError,
  HydrationSourceFailedError,
  HydrationTimeoutError,
} from "./context-hydration.js";

// ============================================================================
// SELF-TEST ERRORS — Pluggable self-verification (#44)
// ============================================================================

export {
  SelfTestConfigurationInvalidError,
  SelfTestError,
  SelfTestHealthCheckFailedError,
  SelfTestTimeoutError,
  SelfTestVerificationFailedError,
} from "./self-test.js";

// ACE ERRORS — Adaptive Context Engine (#87)
// ============================================================================

export {
  AceConfigurationError,
  AceError,
  PlaybookError,
  ReflectionError,
  TrajectoryError,
} from "./ace.js";

// ============================================================================
// ARTIFACT ERRORS — Persistent artifact store (#162)
// ============================================================================

export {
  ArtifactError,
  ArtifactInvalidTypeError,
  ArtifactNotFoundError,
  ArtifactSearchFailedError,
  ArtifactStoreUnavailableError,
  ArtifactValidationFailedError,
  ArtifactVersionConflictError,
} from "./artifact.js";

// DELEGATION ERRORS — Task delegation lifecycle (#141)
// ============================================================================

export {
  DelegationError,
  DelegationExhaustedError,
  DelegationInvalidError,
  DelegationNodeUnavailableError,
  DelegationTimeoutError,
} from "./delegation.js";

// OBSERVATIONAL MEMORY ERRORS — Observer + Reflector agents (#154)
// ============================================================================

export {
  ObservationalConfigurationError,
  ObservationalError,
  ObservationalReflectionError,
  ObservationExtractionError,
} from "./observational.js";

// ============================================================================
// PLUGIN ERRORS — Three-tier plugin discovery & registration (#108)
// ============================================================================

export {
  PluginCapabilityError,
  PluginConfigurationError,
  PluginError,
  PluginLifecycleError,
  PluginLoadError,
  type PluginLoadPhase,
  PluginRegistrationError,
} from "./plugin.js";

// ============================================================================
// A2A ERRORS — Agent-to-Agent protocol client (#126)
// ============================================================================

export {
  A2aAuthFailedError,
  A2aDiscoveryFailedError,
  A2aError,
  A2aTaskFailedError,
  A2aTaskRejectedError,
  A2aTaskTimeoutError,
  A2aUnsupportedOperationError,
} from "./a2a.js";

// ============================================================================
// DOCTOR ERRORS — Security scanner and multi-tenant audits (#27)
// ============================================================================

export {
  DoctorCheckFailedError,
  DoctorConfigurationError,
  DoctorError,
  DoctorNexusUnavailableError,
  DoctorScanTimeoutError,
} from "./doctor.js";

// ============================================================================
// CODE MODE ERRORS — LLM-generated code execution via Monty sandbox (#111)
// ============================================================================

export {
  CodeExecutionTimeoutError,
  CodeModeError,
  CodeResourceExceededError,
  CodeRuntimeError,
  CodeSandboxNotFoundError,
  CodeSyntaxError,
} from "./code-mode.js";

// ============================================================================
// HUMAN DELAY ERRORS — Human-like typing delay simulation (#88)
// ============================================================================

export { HumanDelayConfigurationError, HumanDelayError } from "./human-delay.js";

// ============================================================================
// PAIRING ERRORS — Code-based DM channel access control (#89)
// ============================================================================

export {
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingConfigurationError,
  PairingError,
  PairingRateLimitedError,
} from "./pairing.js";

// ============================================================================
// GUARDRAIL ERRORS — Output validation guardrails (#28)
// ============================================================================

export {
  type GuardIssue,
  GuardrailConfigurationError,
  GuardrailError,
  GuardrailEvidenceError,
  GuardrailRetryExhaustedError,
  GuardrailSchemaError,
} from "./guardrails.js";

// ============================================================================
// WEB SEARCH ERRORS — Pluggable search providers (#119)
// ============================================================================

export {
  SearchAllProvidersFailedError,
  SearchInvalidQueryError,
  SearchProviderError,
  SearchRateLimitedError,
  WebSearchError,
} from "./web-search.js";

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
  BootstrapFileNotFoundError,
  BootstrapFileTooLargeError,
  BootstrapParseFailedError,
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
  EntityConfigurationError,
  EntityDuplicateError,
  EntityExtractionError,
  EntityNotFoundError,
  EntityTrackError,
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
  LspInitializationFailedError,
  LspRequestFailedError,
  LspServerCrashedError,
  LspServerNotFoundError,
  LspTransportError,
  ManifestFileNotFoundError,
  ManifestGovernanceError,
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
  SkillResourceNotFoundError,
  SkillValidationError,
  TemplarConfigError,
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  VoiceConnectionFailedError,
  VoicePipelineError,
  VoiceRoomError,
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
