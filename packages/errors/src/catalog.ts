/**
 * Error Catalog - Single Source of Truth
 *
 * This catalog defines all error codes used across the Templar monorepo.
 * Each error code maps to HTTP status codes and gRPC canonical codes.
 *
 * Naming convention: DOMAIN_SPECIFIC_ERROR (UPPER_SNAKE_CASE)
 * Domains: AUTH, AGENT, WORKFLOW, DEPLOYMENT, RESOURCE, VALIDATION, INTERNAL
 */

export const ERROR_CATALOG = {
  // ============================================================================
  // INTERNAL ERRORS - System failures and unknown errors
  // ============================================================================
  INTERNAL_ERROR: {
    domain: "internal",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Internal server error",
    description: "An unexpected error occurred",
  },
  INTERNAL_NOT_IMPLEMENTED: {
    domain: "internal",
    httpStatus: 501,
    grpcCode: "UNIMPLEMENTED" as const,
    title: "Not implemented",
    description: "This feature is not yet implemented",
  },
  INTERNAL_UNAVAILABLE: {
    domain: "internal",
    httpStatus: 503,
    grpcCode: "UNAVAILABLE" as const,
    title: "Service unavailable",
    description: "The service is temporarily unavailable",
  },
  INTERNAL_TIMEOUT: {
    domain: "internal",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
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
    title: "Authentication token expired",
    description: "The authentication token has expired",
  },
  AUTH_TOKEN_INVALID: {
    domain: "auth",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    title: "Invalid authentication token",
    description: "The authentication token is invalid or malformed",
  },
  AUTH_TOKEN_MISSING: {
    domain: "auth",
    httpStatus: 401,
    grpcCode: "UNAUTHENTICATED" as const,
    title: "Missing authentication token",
    description: "Authentication token is required but not provided",
  },
  AUTH_INSUFFICIENT_SCOPE: {
    domain: "auth",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
    title: "Insufficient permissions",
    description: "The authenticated user lacks required permissions",
  },
  AUTH_FORBIDDEN: {
    domain: "auth",
    httpStatus: 403,
    grpcCode: "PERMISSION_DENIED" as const,
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
    title: "Resource not found",
    description: "The requested resource does not exist",
  },
  RESOURCE_ALREADY_EXISTS: {
    domain: "resource",
    httpStatus: 409,
    grpcCode: "ALREADY_EXISTS" as const,
    title: "Resource already exists",
    description: "A resource with this identifier already exists",
  },
  RESOURCE_CONFLICT: {
    domain: "resource",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
    title: "Resource conflict",
    description: "The operation conflicts with the current resource state",
  },
  RESOURCE_GONE: {
    domain: "resource",
    httpStatus: 410,
    grpcCode: "NOT_FOUND" as const,
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
    title: "Validation failed",
    description: "The input failed validation",
  },
  VALIDATION_REQUIRED_FIELD: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Required field missing",
    description: "A required field is missing",
  },
  VALIDATION_INVALID_FORMAT: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Invalid format",
    description: "The input format is invalid",
  },
  VALIDATION_OUT_OF_RANGE: {
    domain: "validation",
    httpStatus: 400,
    grpcCode: "OUT_OF_RANGE" as const,
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
    title: "Agent not found",
    description: "The specified agent does not exist",
  },
  AGENT_EXECUTION_FAILED: {
    domain: "agent",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Agent execution failed",
    description: "The agent execution encountered an error",
  },
  AGENT_EXECUTION_TIMEOUT: {
    domain: "agent",
    httpStatus: 504,
    grpcCode: "DEADLINE_EXCEEDED" as const,
    title: "Agent execution timeout",
    description: "The agent execution exceeded the time limit",
  },
  AGENT_INVALID_STATE: {
    domain: "agent",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    title: "Agent in invalid state",
    description: "The agent is in an invalid state for this operation",
  },
  AGENT_CONFIGURATION_INVALID: {
    domain: "agent",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
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
    title: "Memory not found",
    description: "The specified memory does not exist",
  },
  MEMORY_STORE_FAILED: {
    domain: "memory",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Memory store failed",
    description: "Failed to persist memory to the Nexus Memory API",
  },
  MEMORY_SEARCH_FAILED: {
    domain: "memory",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Memory search failed",
    description: "The memory search operation failed",
  },
  MEMORY_CONFIGURATION_INVALID: {
    domain: "memory",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Invalid memory configuration",
    description: "The memory middleware configuration is invalid",
  },
  MEMORY_BATCH_PARTIAL: {
    domain: "memory",
    httpStatus: 207,
    grpcCode: "INTERNAL" as const,
    title: "Partial batch failure",
    description: "Some memories in the batch failed to store",
  },

  // ============================================================================
  // WORKFLOW ERRORS - Workflow orchestration
  // ============================================================================
  WORKFLOW_NOT_FOUND: {
    domain: "workflow",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    title: "Workflow not found",
    description: "The specified workflow does not exist",
  },
  WORKFLOW_EXECUTION_FAILED: {
    domain: "workflow",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Workflow execution failed",
    description: "The workflow execution encountered an error",
  },
  WORKFLOW_INVALID_STATE: {
    domain: "workflow",
    httpStatus: 409,
    grpcCode: "FAILED_PRECONDITION" as const,
    title: "Workflow in invalid state",
    description: "The workflow is in an invalid state for this operation",
  },
  WORKFLOW_STEP_FAILED: {
    domain: "workflow",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
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
    title: "Deployment failed",
    description: "The deployment operation failed",
  },
  DEPLOYMENT_NOT_FOUND: {
    domain: "deployment",
    httpStatus: 404,
    grpcCode: "NOT_FOUND" as const,
    title: "Deployment not found",
    description: "The specified deployment does not exist",
  },
  DEPLOYMENT_INVALID_CONFIG: {
    domain: "deployment",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
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
    title: "Quota exceeded",
    description: "The quota for this resource has been exceeded",
  },
  RATE_LIMIT_EXCEEDED: {
    domain: "quota",
    httpStatus: 429,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    title: "Rate limit exceeded",
    description: "Too many requests, please try again later",
  },
  PAYLOAD_TOO_LARGE: {
    domain: "quota",
    httpStatus: 413,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
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
    title: "Budget exhausted",
    description: "The agent budget has been exhausted and the hard limit is active",
  },
  PAY_TRANSFER_FAILED: {
    domain: "pay",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Transfer failed",
    description: "The credit transfer operation failed",
  },
  PAY_BALANCE_CHECK_FAILED: {
    domain: "pay",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Balance check failed",
    description: "Failed to retrieve the agent wallet balance",
  },
  PAY_CONFIGURATION_INVALID: {
    domain: "pay",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Invalid pay configuration",
    description: "The pay middleware configuration is invalid",
  },
  PAY_RESERVATION_EXPIRED: {
    domain: "pay",
    httpStatus: 409,
    grpcCode: "ABORTED" as const,
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
    title: "Audit write failed",
    description: "Failed to write audit event to the Nexus Event Log",
  },
  AUDIT_BATCH_WRITE_FAILED: {
    domain: "audit",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Audit batch write failed",
    description: "Failed to write batch of audit events to the Nexus Event Log",
  },
  AUDIT_BUFFER_OVERFLOW: {
    domain: "audit",
    httpStatus: 507,
    grpcCode: "RESOURCE_EXHAUSTED" as const,
    title: "Audit buffer overflow",
    description: "The audit event buffer exceeded its maximum capacity",
  },
  AUDIT_CONFIGURATION_INVALID: {
    domain: "audit",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Invalid audit configuration",
    description: "The audit middleware configuration is invalid",
  },
  AUDIT_REDACTION_FAILED: {
    domain: "audit",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
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
    title: "Permission denied",
    description: "The agent does not have permission to use this tool",
  },
  PERMISSION_CHECK_FAILED: {
    domain: "permission",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Permission check failed",
    description: "Failed to check permission against the Nexus ReBAC API",
  },
  PERMISSION_GRANT_FAILED: {
    domain: "permission",
    httpStatus: 500,
    grpcCode: "INTERNAL" as const,
    title: "Permission grant failed",
    description: "Failed to grant permission via the Nexus permissions API",
  },
  PERMISSION_CONFIGURATION_INVALID: {
    domain: "permission",
    httpStatus: 400,
    grpcCode: "INVALID_ARGUMENT" as const,
    title: "Invalid permission configuration",
    description: "The permissions middleware configuration is invalid",
  },

  // ============================================================================
  // CHANNEL ERRORS - Channel capability and communication
  // ============================================================================
  VALIDATION_CAPABILITY_NOT_SUPPORTED: {
    domain: "validation",
    httpStatus: 422,
    grpcCode: "FAILED_PRECONDITION" as const,
    title: "Capability not supported",
    description: "The channel does not support the requested capability",
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
