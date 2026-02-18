/**
 * Error Catalog - Single Source of Truth
 *
 * This catalog defines all error codes used across the Templar monorepo.
 * Each error code maps to HTTP status codes, gRPC canonical codes, and a
 * base error type for the consolidated 8-type hierarchy.
 *
 * Naming convention: DOMAIN_SPECIFIC_ERROR (UPPER_SNAKE_CASE)
 * Domains: AUTH, AGENT, WORKFLOW, DEPLOYMENT, RESOURCE, VALIDATION, INTERNAL
 */

/**
 * The 8 behavioral base error types that all error codes map to.
 */
export type BaseErrorType =
  | "ValidationError"
  | "NotFoundError"
  | "PermissionError"
  | "ConflictError"
  | "RateLimitError"
  | "TimeoutError"
  | "ExternalError"
  | "InternalError";

export const ERROR_CATALOG = {
  // ============================================================================
  // INTERNAL ERRORS - System failures and unknown errors
  // ============================================================================
  INTERNAL_ERROR: {
    domain: "internal",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Internal server error",
    description: "An unexpected error occurred",
  },
  INTERNAL_NOT_IMPLEMENTED: {
    domain: "internal",
    httpStatus: 501,
    grpcCode: "UNIMPLEMENTED" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Not implemented",
    description: "This feature is not yet implemented",
  },
  INTERNAL_UNAVAILABLE: {
    domain: "internal",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Service unavailable",
    description: "The service is temporarily unavailable",
  },
  INTERNAL_TIMEOUT: {
    domain: "internal",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Request timeout",
    description: "The operation exceeded the deadline",
  },

  // ============================================================================
  // AUTH ERRORS - Authentication and authorization
  // ============================================================================
  AUTH_TOKEN_EXPIRED: {
    domain: "auth",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Authentication token expired",
    description: "The authentication token has expired",
  },
  AUTH_TOKEN_INVALID: {
    domain: "auth",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Invalid authentication token",
    description: "The authentication token is invalid or malformed",
  },
  AUTH_TOKEN_MISSING: {
    domain: "auth",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Missing authentication token",
    description: "Authentication token is required but not provided",
  },
  AUTH_INSUFFICIENT_SCOPE: {
    domain: "auth",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Insufficient permissions",
    description: "The authenticated user lacks required permissions",
  },
  AUTH_FORBIDDEN: {
    domain: "auth",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Access forbidden",
    description: "Access to this resource is forbidden",
  },

  // ============================================================================
  // RESOURCE ERRORS - Generic resource operations
  // ============================================================================
  RESOURCE_NOT_FOUND: {
    domain: "resource",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Resource not found",
    description: "The requested resource does not exist",
  },
  RESOURCE_ALREADY_EXISTS: {
    domain: "resource",
    httpStatus: 409,
    grpcCode: "ALREADY_EXISTS" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Resource already exists",
    description: "A resource with this identifier already exists",
  },
  RESOURCE_CONFLICT: {
    domain: "resource",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Resource conflict",
    description: "The operation conflicts with the current resource state",
  },
  RESOURCE_GONE: {
    domain: "resource",
    httpStatus: 410,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Resource gone",
    description: "The resource is no longer available",
  },

  // ============================================================================
  // VALIDATION ERRORS - Input validation failures
  // ============================================================================
  VALIDATION_FAILED: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Validation failed",
    description: "The input failed validation",
  },
  VALIDATION_REQUIRED_FIELD: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Required field missing",
    description: "A required field is missing",
  },
  VALIDATION_INVALID_FORMAT: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid format",
    description: "The input format is invalid",
  },
  VALIDATION_OUT_OF_RANGE: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "OUT_OF_RANGE" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Value out of range",
    description: "The input value is outside the acceptable range",
  },

  // ============================================================================
  // AGENT ERRORS - AI agent execution
  // ============================================================================
  AGENT_NOT_FOUND: {
    domain: "agent",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Agent not found",
    description: "The specified agent does not exist",
  },
  AGENT_EXECUTION_FAILED: {
    domain: "agent",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Agent execution failed",
    description: "The agent execution encountered an error",
  },
  AGENT_EXECUTION_TIMEOUT: {
    domain: "agent",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Agent execution timeout",
    description: "The agent execution exceeded the time limit",
  },
  AGENT_INVALID_STATE: {
    domain: "agent",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Agent in invalid state",
    description: "The agent is in an invalid state for this operation",
  },
  AGENT_CONFIGURATION_INVALID: {
    domain: "agent",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid agent configuration",
    description: "The agent configuration is invalid",
  },

  // ============================================================================
  // MEMORY ERRORS - Agent memory operations
  // ============================================================================
  MEMORY_NOT_FOUND: {
    domain: "memory",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Memory not found",
    description: "The specified memory does not exist",
  },
  MEMORY_STORE_FAILED: {
    domain: "memory",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Memory store failed",
    description: "Failed to persist memory to the Nexus Memory API",
  },
  MEMORY_SEARCH_FAILED: {
    domain: "memory",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Memory search failed",
    description: "The memory search operation failed",
  },
  MEMORY_CONFIGURATION_INVALID: {
    domain: "memory",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid memory configuration",
    description: "The memory middleware configuration is invalid",
  },
  MEMORY_BATCH_PARTIAL: {
    domain: "memory",
    httpStatus: 207,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Partial batch failure",
    description: "Some memories in the batch failed to store",
  },

  // ============================================================================
  // ENTITY ERRORS - Entity memory and relationship graph
  // ============================================================================
  ENTITY_NOT_FOUND: {
    domain: "entity",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Entity not found",
    description: "The specified entity does not exist in the knowledge graph",
  },
  ENTITY_TRACK_FAILED: {
    domain: "entity",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Entity track failed",
    description: "Failed to track entity in the Nexus Memory knowledge graph",
  },
  ENTITY_DUPLICATE: {
    domain: "entity",
    httpStatus: 409,
    grpcCode: "ALREADY_EXISTS" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Entity duplicate",
    description: "Entity resolution found an ambiguous match for the given name",
  },
  ENTITY_CONFIGURATION_INVALID: {
    domain: "entity",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid entity memory configuration",
    description: "The entity memory configuration is invalid",
  },
  ENTITY_EXTRACTION_FAILED: {
    domain: "entity",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Entity extraction failed",
    description: "The entity extractor failed to extract entities from content",
  },

  // ============================================================================
  // WORKFLOW ERRORS - Workflow orchestration
  // ============================================================================
  WORKFLOW_NOT_FOUND: {
    domain: "workflow",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Workflow not found",
    description: "The specified workflow does not exist",
  },
  WORKFLOW_EXECUTION_FAILED: {
    domain: "workflow",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Workflow execution failed",
    description: "The workflow execution encountered an error",
  },
  WORKFLOW_INVALID_STATE: {
    domain: "workflow",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Workflow in invalid state",
    description: "The workflow is in an invalid state for this operation",
  },
  WORKFLOW_STEP_FAILED: {
    domain: "workflow",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Workflow step failed",
    description: "A workflow step failed during execution",
  },

  // ============================================================================
  // DEPLOYMENT ERRORS - Deployment and infrastructure
  // ============================================================================
  DEPLOYMENT_FAILED: {
    domain: "deployment",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Deployment failed",
    description: "The deployment operation failed",
  },
  DEPLOYMENT_NOT_FOUND: {
    domain: "deployment",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Deployment not found",
    description: "The specified deployment does not exist",
  },
  DEPLOYMENT_INVALID_CONFIG: {
    domain: "deployment",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid deployment configuration",
    description: "The deployment configuration is invalid",
  },

  // ============================================================================
  // QUOTA/RATE LIMIT ERRORS - Resource exhaustion
  // ============================================================================
  QUOTA_EXCEEDED: {
    domain: "quota",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Quota exceeded",
    description: "The quota for this resource has been exceeded",
  },
  RATE_LIMIT_EXCEEDED: {
    domain: "quota",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Rate limit exceeded",
    description: "Too many requests, please try again later",
  },
  PAYLOAD_TOO_LARGE: {
    domain: "quota",
    httpStatus: 413,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Payload too large",
    description: "The request payload exceeds the size limit",
  },
  // ============================================================================
  // PAY ERRORS - Budget tracking and cost management
  // ============================================================================
  PAY_BUDGET_EXHAUSTED: {
    domain: "pay",
    httpStatus: 403,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Budget exhausted",
    description: "The agent budget has been exhausted and the hard limit is active",
  },
  PAY_TRANSFER_FAILED: {
    domain: "pay",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Transfer failed",
    description: "The credit transfer operation failed",
  },
  PAY_BALANCE_CHECK_FAILED: {
    domain: "pay",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Balance check failed",
    description: "Failed to retrieve the agent wallet balance",
  },
  PAY_CONFIGURATION_INVALID: {
    domain: "pay",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid pay configuration",
    description: "The pay middleware configuration is invalid",
  },
  PAY_RESERVATION_EXPIRED: {
    domain: "pay",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Reservation expired",
    description: "The credit reservation has expired and cannot be committed",
  },
  // ============================================================================
  // AUDIT ERRORS — Compliance logging via Nexus Event Log
  // ============================================================================
  AUDIT_WRITE_FAILED: {
    domain: "audit",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Audit write failed",
    description: "Failed to write audit event to the Nexus Event Log",
  },
  AUDIT_BATCH_WRITE_FAILED: {
    domain: "audit",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Audit batch write failed",
    description: "Failed to write batch of audit events to the Nexus Event Log",
  },
  AUDIT_BUFFER_OVERFLOW: {
    domain: "audit",
    httpStatus: 507,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: false,
    title: "Audit buffer overflow",
    description: "The audit event buffer exceeded its maximum capacity",
  },
  AUDIT_CONFIGURATION_INVALID: {
    domain: "audit",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid audit configuration",
    description: "The audit middleware configuration is invalid",
  },
  AUDIT_REDACTION_FAILED: {
    domain: "audit",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Audit redaction failed",
    description: "Failed to redact sensitive data from audit event",
  },

  // ============================================================================
  // PERMISSION ERRORS — Tool-level permission enforcement
  // ============================================================================
  PERMISSION_DENIED: {
    domain: "permission",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Permission denied",
    description: "The agent does not have permission to use this tool",
  },
  PERMISSION_CHECK_FAILED: {
    domain: "permission",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Permission check failed",
    description: "Failed to check permission against the Nexus ReBAC API",
  },
  PERMISSION_GRANT_FAILED: {
    domain: "permission",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Permission grant failed",
    description: "Failed to grant permission via the Nexus permissions API",
  },
  PERMISSION_CONFIGURATION_INVALID: {
    domain: "permission",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid permission configuration",
    description: "The permissions middleware configuration is invalid",
  },

  // ============================================================================
  // CHANNEL ERRORS - Channel capability and communication
  // ============================================================================
  CHANNEL_SEND_ERROR: {
    domain: "channel",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Channel send error",
    description: "Failed to send a message through the channel",
  },
  CHANNEL_AUTH_EXPIRED: {
    domain: "channel",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Channel authentication expired",
    description: "The channel authentication session has expired and must be re-established",
  },
  CHANNEL_AUTH_REQUIRED: {
    domain: "channel",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Channel authentication required",
    description: "The channel requires interactive authentication (e.g., QR scan, OAuth flow)",
  },
  CHANNEL_SESSION_REPLACED: {
    domain: "channel",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Channel session replaced",
    description: "The channel session was replaced by another client and cannot be resumed",
  },
  CHANNEL_NOT_FOUND: {
    domain: "channel",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Channel not found",
    description: "The specified channel type is not registered",
  },
  CHANNEL_LOAD_FAILED: {
    domain: "channel",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Channel load failed",
    description: "Failed to load or initialize the channel adapter",
  },
  VALIDATION_CAPABILITY_NOT_SUPPORTED: {
    domain: "validation",
    httpStatus: 422,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Capability not supported",
    description: "The channel does not support the requested capability",
  },

  // ============================================================================
  // VOICE ERRORS - Real-time voice channel
  // ============================================================================
  VOICE_CONNECTION_FAILED: {
    domain: "voice",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Voice connection failed",
    description: "Failed to establish WebRTC connection to the voice room",
  },
  VOICE_PIPELINE_ERROR: {
    domain: "voice",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Voice pipeline error",
    description: "Error in STT/TTS voice processing pipeline",
  },
  VOICE_ROOM_ERROR: {
    domain: "voice",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Voice room error",
    description: "Error managing the LiveKit voice room lifecycle",
  },

  // ============================================================================
  // GATEWAY ERRORS - WebSocket control plane
  // ============================================================================
  GATEWAY_NODE_NOT_FOUND: {
    domain: "gateway",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Gateway node not found",
    description: "The specified node is not registered with the gateway",
  },
  GATEWAY_AGENT_NOT_FOUND: {
    domain: "gateway",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Gateway agent not found",
    description: "The specified agent is not served by any registered node",
  },
  GATEWAY_NODE_ALREADY_REGISTERED: {
    domain: "gateway",
    httpStatus: 409,
    grpcCode: "ALREADY_EXISTS" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Node already registered",
    description: "A node with this identifier is already registered with the gateway",
  },
  GATEWAY_AUTH_FAILED: {
    domain: "gateway",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Gateway authentication failed",
    description: "The node failed to authenticate with the gateway",
  },
  GATEWAY_SESSION_EXPIRED: {
    domain: "gateway",
    httpStatus: 410,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Gateway session expired",
    description: "The session has expired and can no longer be resumed",
  },
  GATEWAY_SESSION_INVALID_TRANSITION: {
    domain: "gateway",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Invalid session transition",
    description: "The session cannot transition from its current state with this event",
  },
  GATEWAY_LANE_OVERFLOW: {
    domain: "gateway",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Lane queue overflow",
    description: "The lane queue has reached capacity and a message was dropped",
  },
  GATEWAY_CONFIG_INVALID: {
    domain: "gateway",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid gateway configuration",
    description: "The gateway configuration is invalid",
  },
  GATEWAY_CONFIG_RELOAD_FAILED: {
    domain: "gateway",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Config reload failed",
    description: "Failed to reload the gateway configuration from file",
  },
  GATEWAY_HEARTBEAT_TIMEOUT: {
    domain: "gateway",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Heartbeat timeout",
    description: "The node failed to respond to a heartbeat within the expected interval",
  },
  // ============================================================================
  // AG-UI ERRORS - AG-UI SSE streaming
  // ============================================================================
  AGUI_INVALID_INPUT: {
    domain: "agui",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid AG-UI input",
    description: "The RunAgentInput payload failed validation",
  },
  AGUI_STREAM_INTERRUPTED: {
    domain: "agui",
    httpStatus: 499,
    grpcCode: "CANCELLED" as const,
    baseType: "ExternalError" as const,
    isExpected: true,
    title: "Stream interrupted",
    description: "The SSE stream was interrupted by a client disconnect",
  },
  AGUI_ENCODING_FAILED: {
    domain: "agui",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Encoding failed",
    description: "Failed to encode an AG-UI event for SSE transport",
  },
  AGUI_RUN_TIMEOUT: {
    domain: "agui",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Run timeout",
    description: "The agent run exceeded the maximum stream duration",
  },
  AGUI_RUN_FAILED: {
    domain: "agui",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Run failed",
    description: "The agent run failed during execution",
  },
  AGUI_CONNECTION_LIMIT_REACHED: {
    domain: "agui",
    httpStatus: 503,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Connection limit reached",
    description: "The AG-UI server has reached its maximum concurrent connection limit",
  },

  // ============================================================================
  // HOOK ERRORS — Lifecycle hook system
  // ============================================================================
  HOOK_CONFIGURATION_INVALID: {
    domain: "hook",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid hook configuration",
    description: "The hook registry configuration is invalid",
  },
  HOOK_EXECUTION_FAILED: {
    domain: "hook",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Hook execution failed",
    description: "A hook handler threw an error during execution",
  },
  HOOK_TIMEOUT: {
    domain: "hook",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Hook timeout",
    description: "A hook handler exceeded the configured timeout",
  },
  HOOK_REENTRANCY_EXCEEDED: {
    domain: "hook",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Hook re-entrancy exceeded",
    description: "Hook emit() calls exceeded the maximum re-entrancy depth",
  },

  // ============================================================================
  // MCP ERRORS - MCP client bridge
  // ============================================================================
  MCP_CONNECTION_FAILED: {
    domain: "mcp",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP connection failed",
    description: "Failed to connect to the MCP server",
  },
  MCP_INITIALIZATION_FAILED: {
    domain: "mcp",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP initialization failed",
    description: "MCP protocol handshake or capability negotiation failed",
  },
  MCP_TOOL_CALL_FAILED: {
    domain: "mcp",
    httpStatus: 502,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP tool call failed",
    description: "The MCP tool invocation returned an error",
  },
  MCP_TOOL_NOT_FOUND: {
    domain: "mcp",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "MCP tool not found",
    description: "The requested tool does not exist on the MCP server",
  },
  MCP_RESOURCE_NOT_FOUND: {
    domain: "mcp",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "MCP resource not found",
    description: "The requested resource URI was not found on the MCP server",
  },
  MCP_RESOURCE_READ_FAILED: {
    domain: "mcp",
    httpStatus: 502,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP resource read failed",
    description: "Failed to read the resource from the MCP server",
  },
  MCP_TRANSPORT_ERROR: {
    domain: "mcp",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP transport error",
    description: "A transport-level communication error occurred",
  },
  MCP_SERVER_DISCONNECTED: {
    domain: "mcp",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "MCP server disconnected",
    description: "The MCP server connection was lost unexpectedly",
  },

  // ============================================================================
  // NODE ERRORS — Local device agent runtime
  // ============================================================================
  NODE_START_ERROR: {
    domain: "node",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Node start failed",
    description: "The node cannot start from its current state",
  },
  NODE_REGISTRATION_TIMEOUT: {
    domain: "node",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Node registration timeout",
    description: "The node failed to complete registration with the gateway within the timeout",
  },
  NODE_AUTH_FAILURE: {
    domain: "node",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Node authentication failure",
    description: "The node failed to authenticate with the gateway",
  },
  NODE_RECONNECT_EXHAUSTED: {
    domain: "node",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Node reconnection exhausted",
    description: "The node exhausted all reconnection attempts to the gateway",
  },
  NODE_HANDLER_ERROR: {
    domain: "node",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Node handler error",
    description: "A user-registered handler threw an error during execution",
  },
  NODE_CONNECTION_TIMEOUT: {
    domain: "node",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Node connection timeout",
    description: "The WebSocket connection to the gateway timed out",
  },
  NODE_FRAME_TOO_LARGE: {
    domain: "node",
    httpStatus: 413,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Node frame too large",
    description: "An incoming WebSocket frame exceeded the maximum allowed size",
  },
  NODE_STOPPED: {
    domain: "node",
    httpStatus: 503,
    grpcCode: "CANCELLED" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Node stopped",
    description: "The operation was cancelled because the node is stopping",
  },
  NODE_DEVICE_KEY_INVALID: {
    domain: "node",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Invalid device key",
    description: "The Ed25519 device key JWT is invalid or malformed",
  },
  NODE_DEVICE_KEY_MISMATCH: {
    domain: "node",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Device key mismatch",
    description:
      "The Ed25519 public key does not match the previously registered key for this node",
  },
  NODE_DEVICE_KEY_EXPIRED: {
    domain: "node",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Device key expired",
    description: "The Ed25519 device key JWT has expired",
  },
  GATEWAY_TOFU_REJECTED: {
    domain: "gateway",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "TOFU registration rejected",
    description: "Trust-On-First-Use device key registration is disabled; pre-register the key",
  },

  // ============================================================================
  // SANITIZE ERRORS — Content sanitization
  // ============================================================================
  SANITIZE_CONFIGURATION_INVALID: {
    domain: "sanitize",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid sanitize configuration",
    description: "The sanitizer configuration is invalid",
  },
  SANITIZE_RULE_FAILED: {
    domain: "sanitize",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Sanitization rule failed",
    description: "A sanitization rule threw an unexpected error during execution",
  },
  SANITIZE_CONTENT_BLOCKED: {
    domain: "sanitize",
    httpStatus: 422,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Content blocked",
    description: "Content was blocked because it exceeds size limits or is entirely malicious",
  },

  // ============================================================================
  // MANIFEST ERRORS — YAML agent definition loader
  // ============================================================================
  MANIFEST_FILE_NOT_FOUND: {
    domain: "manifest",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Manifest file not found",
    description: "The specified manifest YAML file does not exist",
  },
  MANIFEST_PARSE_FAILED: {
    domain: "manifest",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Manifest parse failed",
    description: "The manifest file contains invalid YAML syntax",
  },
  MANIFEST_VALIDATION_FAILED: {
    domain: "manifest",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Manifest validation failed",
    description: "The manifest content does not match the expected schema",
  },
  MANIFEST_INTERPOLATION_FAILED: {
    domain: "manifest",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Manifest interpolation failed",
    description: "Environment variable interpolation failed due to missing variables",
  },
  MANIFEST_GOVERNANCE_VIOLATION: {
    domain: "manifest",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Manifest governance violation",
    description:
      "The manifest contains non-declarative constructs (conditionals, loops, template expressions, or inline code)",
  },

  // ============================================================================
  // BOOTSTRAP ERRORS — Bootstrap file hierarchy
  // ============================================================================
  BOOTSTRAP_FILE_NOT_FOUND: {
    domain: "bootstrap",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Bootstrap file not found",
    description: "A referenced bootstrap file does not exist on disk",
  },
  BOOTSTRAP_FILE_TOO_LARGE: {
    domain: "bootstrap",
    httpStatus: 413,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Bootstrap file too large",
    description: "A bootstrap file exceeds the character budget after truncation marker",
  },
  BOOTSTRAP_PARSE_FAILED: {
    domain: "bootstrap",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Bootstrap file parse failed",
    description: "A bootstrap file is binary, has invalid encoding, or could not be read",
  },

  // ============================================================================
  // MODEL ERRORS — Multi-provider LLM routing and failover
  // ============================================================================
  MODEL_PROVIDER_AUTH_FAILED: {
    domain: "model",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Model provider authentication failed",
    description: "The API key or credentials for the model provider are invalid",
  },
  MODEL_PROVIDER_BILLING_FAILED: {
    domain: "model",
    httpStatus: 402,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "ExternalError" as const,
    isExpected: true,
    title: "Model provider billing failed",
    description: "The model provider rejected the request due to billing issues",
  },
  MODEL_PROVIDER_RATE_LIMITED: {
    domain: "model",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "RateLimitError" as const,
    isExpected: true,
    title: "Model provider rate limited",
    description: "The model provider rate-limited the request",
  },
  MODEL_PROVIDER_TIMEOUT: {
    domain: "model",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Model provider timeout",
    description: "The model provider did not respond within the timeout",
  },
  MODEL_CONTEXT_OVERFLOW: {
    domain: "model",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Model context overflow",
    description: "The request exceeds the model's context window",
  },
  MODEL_PROVIDER_ERROR: {
    domain: "model",
    httpStatus: 502,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Model provider error",
    description: "The model provider returned an unexpected error",
  },
  MODEL_ALL_PROVIDERS_FAILED: {
    domain: "model",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "All model providers failed",
    description: "All providers in the fallback chain have been exhausted",
  },
  MODEL_INVALID_CONFIG: {
    domain: "model",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid model router configuration",
    description: "The model router configuration is invalid",
  },

  // ============================================================================
  // SANDBOX ERRORS — OS-level agent sandboxing
  // ============================================================================
  SANDBOX_UNAVAILABLE: {
    domain: "sandbox",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Sandbox unavailable",
    description: "The sandbox runtime dependencies are not installed on this platform",
  },
  SANDBOX_PLATFORM_UNSUPPORTED: {
    domain: "sandbox",
    httpStatus: 400,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Platform unsupported",
    description: "Sandboxing is only supported on macOS (Seatbelt) and Linux (bubblewrap)",
  },
  SANDBOX_CONFIG_INVALID: {
    domain: "sandbox",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid sandbox configuration",
    description: "The sandbox configuration failed validation",
  },
  SANDBOX_EXEC_FAILED: {
    domain: "sandbox",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Sandbox execution failed",
    description: "The sandboxed command execution failed",
  },
  SANDBOX_EXEC_TIMEOUT: {
    domain: "sandbox",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Sandbox execution timeout",
    description: "The sandboxed command exceeded the configured timeout duration",
  },
  SANDBOX_POLICY_VIOLATION: {
    domain: "sandbox",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Sandbox policy violation",
    description: "The sandboxed command attempted an operation blocked by the security policy",
  },

  // ============================================================================
  // LONG-RUNNING ERRORS — Multi-session agent harness
  // ============================================================================
  LONGRUNNING_GIT_UNAVAILABLE: {
    domain: "longrunning",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Git unavailable",
    description: "Git binary is not installed or the workspace is not a git repository",
  },
  LONGRUNNING_WORKSPACE_INVALID: {
    domain: "longrunning",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid workspace",
    description: "The workspace path does not exist or is not writable",
  },
  LONGRUNNING_FEATURE_LIST_CORRUPTED: {
    domain: "longrunning",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Feature list corrupted",
    description: "The feature list file contains invalid JSON and could not be recovered from git",
  },
  LONGRUNNING_FEATURE_IMMUTABILITY_VIOLATION: {
    domain: "longrunning",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Feature immutability violation",
    description:
      "An attempt was made to modify a feature in a way that violates immutability constraints",
  },
  LONGRUNNING_SESSION_BOOTSTRAP_FAILED: {
    domain: "longrunning",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Session bootstrap failed",
    description: "Failed to bootstrap the session context from workspace files",
  },
  LONGRUNNING_INIT_SCRIPT_FAILED: {
    domain: "longrunning",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Init script failed",
    description: "The init.sh bootstrap script failed to execute successfully",
  },

  // ============================================================================
  // APPLICATION-SPECIFIC ERRORS — Templar SDK and Nexus client
  // ============================================================================
  TEMPLAR_CONFIG_INVALID: {
    domain: "internal",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid Templar configuration",
    description: "The Templar SDK configuration is invalid",
  },
  NEXUS_CLIENT_ERROR: {
    domain: "internal",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Nexus client error",
    description: "The Nexus client configuration or invocation is invalid",
  },

  // ============================================================================
  // SKILL ERRORS — Agent Skills standard (agentskills.io)
  // ============================================================================
  SKILL_NOT_FOUND: {
    domain: "skill",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Skill not found",
    description: "The specified skill does not exist in any resolver",
  },
  SKILL_PARSE_ERROR: {
    domain: "skill",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Skill parse error",
    description: "The SKILL.md file has invalid YAML frontmatter or is malformed",
  },
  SKILL_VALIDATION_ERROR: {
    domain: "skill",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Skill validation error",
    description: "The skill metadata does not conform to the Agent Skills specification",
  },

  // ============================================================================
  // ACP ERRORS — Agent Client Protocol (IDE integration)
  // ============================================================================
  ACP_SESSION_NOT_FOUND: {
    domain: "acp",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "ACP session not found",
    description: "The specified ACP session does not exist or was deleted",
  },
  ACP_PERMISSION_DENIED: {
    domain: "acp",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "ACP permission denied",
    description: "The IDE client rejected the agent's permission request",
  },
  ACP_TRANSPORT_CLOSED: {
    domain: "acp",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "ACP transport closed",
    description: "The stdio pipe or transport connection was closed unexpectedly",
  },
  ACP_VERSION_MISMATCH: {
    domain: "acp",
    httpStatus: 400,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "ACP version mismatch",
    description: "The ACP protocol version negotiation failed — client and agent are incompatible",
  },
  ACP_CANCELLED: {
    domain: "acp",
    httpStatus: 499,
    grpcCode: "CANCELLED" as const,
    baseType: "ExternalError" as const,
    isExpected: true,
    title: "ACP prompt cancelled",
    description: "The prompt turn was cancelled by the IDE client",
  },

  // ============================================================================
  // LSP ERRORS — Language Server Protocol client
  // ============================================================================
  LSP_SERVER_NOT_FOUND: {
    domain: "lsp",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "LSP server not found",
    description: "No language server is configured for the requested language",
  },
  LSP_INITIALIZATION_FAILED: {
    domain: "lsp",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "LSP initialization failed",
    description: "The language server process started but the LSP handshake failed",
  },
  LSP_REQUEST_FAILED: {
    domain: "lsp",
    httpStatus: 502,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "LSP request failed",
    description: "An LSP request returned an error response",
  },
  LSP_SERVER_CRASHED: {
    domain: "lsp",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "LSP server crashed",
    description: "The language server process exited unexpectedly",
  },
  LSP_TRANSPORT_ERROR: {
    domain: "lsp",
    httpStatus: 502,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "LSP transport error",
    description: "The stdio transport pipe is broken or a read/write failed",
  },

  // ============================================================================
  // ACE ERRORS — Adaptive Context Engine (playbooks, trajectories, reflection)
  // ============================================================================
  ACE_CONFIGURATION_INVALID: {
    domain: "ace",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid ACE configuration",
    description: "The ACE middleware configuration is invalid",
  },
  ACE_TRAJECTORY_FAILED: {
    domain: "ace",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Trajectory operation failed",
    description: "Failed to start, log, or complete a trajectory via the Nexus ACE API",
  },
  ACE_PLAYBOOK_FAILED: {
    domain: "ace",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Playbook operation failed",
    description: "Failed to load or query playbooks via the Nexus ACE API",
  },
  ACE_REFLECTION_FAILED: {
    domain: "ace",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Reflection failed",
    description: "The reflection LLM call failed during post-session analysis",
  },

  // ============================================================================
  // ENGINE EXECUTION GUARD ERRORS — Loop detection and iteration limits
  // ============================================================================
  ENGINE_ITERATION_LIMIT: {
    domain: "engine",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "InternalError" as const,
    isExpected: true,
    title: "Iteration limit exceeded",
    description: "Agent exceeded the maximum allowed iterations per run",
  },
  ENGINE_LOOP_DETECTED: {
    domain: "engine",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "InternalError" as const,
    isExpected: true,
    title: "Agent loop detected",
    description: "Agent execution loop detected — repeating tool call pattern or identical outputs",
  },
  ENGINE_EXECUTION_TIMEOUT: {
    domain: "engine",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "InternalError" as const,
    isExpected: false,
    title: "Execution timeout",
    description: "Agent execution exceeded the configured wall-clock time limit",
  },

  // ============================================================================
  // ENGINE SPAWN GOVERNANCE ERRORS (#163) — Cross-agent spawn limits
  // ============================================================================
  ENGINE_SPAWN_DEPTH_EXCEEDED: {
    domain: "engine",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "InternalError" as const,
    isExpected: true,
    title: "Spawn depth exceeded",
    description: "Sub-agent spawn attempt exceeds the maximum allowed spawn depth",
  },
  ENGINE_SPAWN_CHILD_LIMIT: {
    domain: "engine",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "InternalError" as const,
    isExpected: true,
    title: "Spawn child limit exceeded",
    description: "Parent agent exceeded the maximum number of concurrent children",
  },
  ENGINE_SPAWN_CONCURRENCY_LIMIT: {
    domain: "engine",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    baseType: "InternalError" as const,
    isExpected: true,
    title: "Spawn concurrency limit exceeded",
    description: "Total concurrent sub-agents across the orchestration tree reached the limit",
  },
  ENGINE_SPAWN_TOOL_DENIED: {
    domain: "engine",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    baseType: "PermissionError" as const,
    isExpected: true,
    title: "Spawn tool denied",
    description: "Tool is denied at the current spawn depth by the depth-aware tool policy",
  },

  // ============================================================================
  // SELF-TEST ERRORS — Pluggable self-verification (#44)
  // ============================================================================
  SELF_TEST_HEALTH_CHECK_FAILED: {
    domain: "selftest",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Health check failed",
    description: "One or more health checks failed during preflight verification",
  },
  SELF_TEST_VERIFICATION_FAILED: {
    domain: "selftest",
    httpStatus: 422,
    grpcCode: "FAILED_PRECONDITION" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Verification failed",
    description: "One or more verification assertions failed",
  },
  SELF_TEST_TIMEOUT: {
    domain: "selftest",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    baseType: "TimeoutError" as const,
    isExpected: false,
    title: "Self-test timeout",
    description: "A self-test verifier exceeded the configured timeout",
  },
  SELF_TEST_CONFIGURATION_INVALID: {
    domain: "selftest",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid self-test configuration",
    description: "The self-test configuration is invalid",
  },
  // ============================================================================
  // ARTIFACT ERRORS — Persistent artifact store (#162)
  // ============================================================================
  ARTIFACT_NOT_FOUND: {
    domain: "artifact",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    baseType: "NotFoundError" as const,
    isExpected: true,
    title: "Artifact not found",
    description: "The requested artifact does not exist",
  },
  ARTIFACT_VALIDATION_FAILED: {
    domain: "artifact",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Artifact validation failed",
    description: "The artifact input failed schema validation",
  },
  ARTIFACT_VERSION_CONFLICT: {
    domain: "artifact",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    baseType: "ConflictError" as const,
    isExpected: true,
    title: "Artifact version conflict",
    description: "A concurrent modification caused a version conflict",
  },
  ARTIFACT_SEARCH_FAILED: {
    domain: "artifact",
    httpStatus: 502,
    grpcCode: "INTERNAL" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Artifact search failed",
    description: "The artifact search backend returned an error",
  },
  ARTIFACT_STORE_UNAVAILABLE: {
    domain: "artifact",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    baseType: "ExternalError" as const,
    isExpected: false,
    title: "Artifact store unavailable",
    description: "The artifact storage backend is temporarily unavailable",
  },
  ARTIFACT_INVALID_TYPE: {
    domain: "artifact",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    baseType: "ValidationError" as const,
    isExpected: true,
    title: "Invalid artifact type",
    description: "The artifact type must be 'tool' or 'agent'",
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Union type of all error codes
 */
export type ErrorCode = keyof typeof ERROR_CATALOG;

/**
 * Type representing a single error catalog entry
 */
export type ErrorCatalogEntry = (typeof ERROR_CATALOG)[ErrorCode];

/**
 * Union type of all domain names
 */
export type ErrorDomain = ErrorCatalogEntry["domain"];

/**
 * gRPC canonical status codes used in the catalog
 */
export type GrpcStatusCode = ErrorCatalogEntry["grpcCode"];

/**
 * HTTP status codes used in the catalog
 */
export type HttpStatusCode = ErrorCatalogEntry["httpStatus"];

/**
 * Extract all ErrorCodes that belong to a specific BaseErrorType
 */
export type CodesForBase<B extends BaseErrorType> = {
  [K in ErrorCode]: (typeof ERROR_CATALOG)[K]["baseType"] extends B ? K : never;
}[ErrorCode];
