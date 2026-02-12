import { TemplarError } from "./base.js";
import { ERROR_CATALOG } from "./catalog.js";

// ============================================================================
// INTERNAL ERRORS
// ============================================================================

export class InternalError extends TemplarError {
  readonly _tag = "InternalError" as const;
  readonly code = "INTERNAL_ERROR" as const;
  readonly httpStatus = ERROR_CATALOG.INTERNAL_ERROR.httpStatus;
  readonly grpcCode = ERROR_CATALOG.INTERNAL_ERROR.grpcCode;
  readonly domain = ERROR_CATALOG.INTERNAL_ERROR.domain;
}

export class NotImplementedError extends TemplarError {
  readonly _tag = "NotImplementedError" as const;
  readonly code = "INTERNAL_NOT_IMPLEMENTED" as const;
  readonly httpStatus = ERROR_CATALOG.INTERNAL_NOT_IMPLEMENTED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.INTERNAL_NOT_IMPLEMENTED.grpcCode;
  readonly domain = ERROR_CATALOG.INTERNAL_NOT_IMPLEMENTED.domain;
}

export class ServiceUnavailableError extends TemplarError {
  readonly _tag = "ServiceUnavailableError" as const;
  readonly code = "INTERNAL_UNAVAILABLE" as const;
  readonly httpStatus = ERROR_CATALOG.INTERNAL_UNAVAILABLE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.INTERNAL_UNAVAILABLE.grpcCode;
  readonly domain = ERROR_CATALOG.INTERNAL_UNAVAILABLE.domain;
}

export class TimeoutError extends TemplarError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "INTERNAL_TIMEOUT" as const;
  readonly httpStatus = ERROR_CATALOG.INTERNAL_TIMEOUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.INTERNAL_TIMEOUT.grpcCode;
  readonly domain = ERROR_CATALOG.INTERNAL_TIMEOUT.domain;
}

// ============================================================================
// AUTH ERRORS
// ============================================================================

export class TokenExpiredError extends TemplarError {
  readonly _tag = "TokenExpiredError" as const;
  readonly code = "AUTH_TOKEN_EXPIRED" as const;
  readonly httpStatus = ERROR_CATALOG.AUTH_TOKEN_EXPIRED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUTH_TOKEN_EXPIRED.grpcCode;
  readonly domain = ERROR_CATALOG.AUTH_TOKEN_EXPIRED.domain;
}

export class TokenInvalidError extends TemplarError {
  readonly _tag = "TokenInvalidError" as const;
  readonly code = "AUTH_TOKEN_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.AUTH_TOKEN_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUTH_TOKEN_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.AUTH_TOKEN_INVALID.domain;
}

export class TokenMissingError extends TemplarError {
  readonly _tag = "TokenMissingError" as const;
  readonly code = "AUTH_TOKEN_MISSING" as const;
  readonly httpStatus = ERROR_CATALOG.AUTH_TOKEN_MISSING.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUTH_TOKEN_MISSING.grpcCode;
  readonly domain = ERROR_CATALOG.AUTH_TOKEN_MISSING.domain;
}

export class InsufficientScopeError extends TemplarError {
  readonly _tag = "InsufficientScopeError" as const;
  readonly code = "AUTH_INSUFFICIENT_SCOPE" as const;
  readonly httpStatus = ERROR_CATALOG.AUTH_INSUFFICIENT_SCOPE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUTH_INSUFFICIENT_SCOPE.grpcCode;
  readonly domain = ERROR_CATALOG.AUTH_INSUFFICIENT_SCOPE.domain;

  constructor(
    message: string,
    public readonly requiredScopes: string[],
    public readonly actualScopes: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(message, metadata, traceId);
  }
}

export class ForbiddenError extends TemplarError {
  readonly _tag = "ForbiddenError" as const;
  readonly code = "AUTH_FORBIDDEN" as const;
  readonly httpStatus = ERROR_CATALOG.AUTH_FORBIDDEN.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUTH_FORBIDDEN.grpcCode;
  readonly domain = ERROR_CATALOG.AUTH_FORBIDDEN.domain;
}

// ============================================================================
// RESOURCE ERRORS
// ============================================================================

export class NotFoundError extends TemplarError {
  readonly _tag = "NotFoundError" as const;
  readonly code = "RESOURCE_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.RESOURCE_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RESOURCE_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.RESOURCE_NOT_FOUND.domain;

  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`${resourceType} with ID '${resourceId}' not found`, metadata, traceId);
  }
}

export class AlreadyExistsError extends TemplarError {
  readonly _tag = "AlreadyExistsError" as const;
  readonly code = "RESOURCE_ALREADY_EXISTS" as const;
  readonly httpStatus = ERROR_CATALOG.RESOURCE_ALREADY_EXISTS.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RESOURCE_ALREADY_EXISTS.grpcCode;
  readonly domain = ERROR_CATALOG.RESOURCE_ALREADY_EXISTS.domain;

  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`${resourceType} with ID '${resourceId}' already exists`, metadata, traceId);
  }
}

export class ResourceConflictError extends TemplarError {
  readonly _tag = "ResourceConflictError" as const;
  readonly code = "RESOURCE_CONFLICT" as const;
  readonly httpStatus = ERROR_CATALOG.RESOURCE_CONFLICT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RESOURCE_CONFLICT.grpcCode;
  readonly domain = ERROR_CATALOG.RESOURCE_CONFLICT.domain;
}

export class ResourceGoneError extends TemplarError {
  readonly _tag = "ResourceGoneError" as const;
  readonly code = "RESOURCE_GONE" as const;
  readonly httpStatus = ERROR_CATALOG.RESOURCE_GONE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RESOURCE_GONE.grpcCode;
  readonly domain = ERROR_CATALOG.RESOURCE_GONE.domain;
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class ValidationError extends TemplarError {
  readonly _tag = "ValidationError" as const;
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_FAILED.domain;

  constructor(
    message: string,
    public readonly issues: ValidationIssue[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(message, metadata, traceId);
  }
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export class RequiredFieldError extends TemplarError {
  readonly _tag = "RequiredFieldError" as const;
  readonly code = "VALIDATION_REQUIRED_FIELD" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_REQUIRED_FIELD.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_REQUIRED_FIELD.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_REQUIRED_FIELD.domain;

  constructor(
    public readonly fieldName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Required field '${fieldName}' is missing`, metadata, traceId);
  }
}

export class InvalidFormatError extends TemplarError {
  readonly _tag = "InvalidFormatError" as const;
  readonly code = "VALIDATION_INVALID_FORMAT" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_INVALID_FORMAT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_INVALID_FORMAT.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_INVALID_FORMAT.domain;

  constructor(
    public readonly fieldName: string,
    public readonly expectedFormat: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Field '${fieldName}' has invalid format, expected ${expectedFormat}`, metadata, traceId);
  }
}

export class OutOfRangeError extends TemplarError {
  readonly _tag = "OutOfRangeError" as const;
  readonly code = "VALIDATION_OUT_OF_RANGE" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_OUT_OF_RANGE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_OUT_OF_RANGE.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_OUT_OF_RANGE.domain;

  constructor(
    public readonly fieldName: string,
    public readonly value: number,
    public readonly min?: number,
    public readonly max?: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    const range =
      min !== undefined && max !== undefined
        ? `between ${min} and ${max}`
        : min !== undefined
          ? `at least ${min}`
          : max !== undefined
            ? `at most ${max}`
            : "within acceptable range";
    super(`Field '${fieldName}' value ${value} is out of range (${range})`, metadata, traceId);
  }
}

// ============================================================================
// AGENT ERRORS
// ============================================================================

export class AgentNotFoundError extends TemplarError {
  readonly _tag = "AgentNotFoundError" as const;
  readonly code = "AGENT_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.AGENT_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGENT_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.AGENT_NOT_FOUND.domain;

  constructor(
    public readonly agentId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Agent '${agentId}' not found`, metadata, traceId);
  }
}

export class AgentExecutionError extends TemplarError {
  readonly _tag = "AgentExecutionError" as const;
  readonly code = "AGENT_EXECUTION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AGENT_EXECUTION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGENT_EXECUTION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AGENT_EXECUTION_FAILED.domain;

  constructor(
    public readonly agentId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Agent '${agentId}' execution failed: ${message}`, metadata, traceId);
  }
}

export class AgentTimeoutError extends TemplarError {
  readonly _tag = "AgentTimeoutError" as const;
  readonly code = "AGENT_EXECUTION_TIMEOUT" as const;
  readonly httpStatus = ERROR_CATALOG.AGENT_EXECUTION_TIMEOUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGENT_EXECUTION_TIMEOUT.grpcCode;
  readonly domain = ERROR_CATALOG.AGENT_EXECUTION_TIMEOUT.domain;

  constructor(
    public readonly agentId: string,
    public readonly timeoutMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Agent '${agentId}' execution timed out after ${timeoutMs}ms`, metadata, traceId);
  }
}

export class AgentInvalidStateError extends TemplarError {
  readonly _tag = "AgentInvalidStateError" as const;
  readonly code = "AGENT_INVALID_STATE" as const;
  readonly httpStatus = ERROR_CATALOG.AGENT_INVALID_STATE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGENT_INVALID_STATE.grpcCode;
  readonly domain = ERROR_CATALOG.AGENT_INVALID_STATE.domain;

  constructor(
    public readonly agentId: string,
    public readonly currentState: string,
    public readonly expectedState: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Agent '${agentId}' is in state '${currentState}', expected '${expectedState}'`,
      metadata,
      traceId,
    );
  }
}

export class AgentConfigurationError extends TemplarError {
  readonly _tag = "AgentConfigurationError" as const;
  readonly code = "AGENT_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.AGENT_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGENT_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.AGENT_CONFIGURATION_INVALID.domain;
}

// ============================================================================
// MEMORY ERRORS
// ============================================================================

export class MemoryNotFoundError extends TemplarError {
  readonly _tag = "MemoryNotFoundError" as const;
  readonly code = "MEMORY_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.MEMORY_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MEMORY_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.MEMORY_NOT_FOUND.domain;

  constructor(
    public readonly memoryId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Memory '${memoryId}' not found`, metadata, traceId);
  }
}

export class MemoryStoreError extends TemplarError {
  readonly _tag = "MemoryStoreError" as const;
  readonly code = "MEMORY_STORE_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MEMORY_STORE_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MEMORY_STORE_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MEMORY_STORE_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Memory store failed: ${message}`, metadata, traceId);
  }
}

export class MemorySearchError extends TemplarError {
  readonly _tag = "MemorySearchError" as const;
  readonly code = "MEMORY_SEARCH_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MEMORY_SEARCH_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MEMORY_SEARCH_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MEMORY_SEARCH_FAILED.domain;

  constructor(
    public readonly query: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Memory search failed for query '${query}'`, metadata, traceId);
  }
}

export class MemoryConfigurationError extends TemplarError {
  readonly _tag = "MemoryConfigurationError" as const;
  readonly code = "MEMORY_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.MEMORY_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MEMORY_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.MEMORY_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid memory configuration: ${message}`, metadata, traceId);
  }
}

export class MemoryBatchError extends TemplarError {
  readonly _tag = "MemoryBatchError" as const;
  readonly code = "MEMORY_BATCH_PARTIAL" as const;
  readonly httpStatus = ERROR_CATALOG.MEMORY_BATCH_PARTIAL.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MEMORY_BATCH_PARTIAL.grpcCode;
  readonly domain = ERROR_CATALOG.MEMORY_BATCH_PARTIAL.domain;

  constructor(
    public readonly stored: number,
    public readonly failed: number,
    public readonly errors: Array<{ index: number; error: string }>,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Batch store partial failure: ${stored} stored, ${failed} failed`, metadata, traceId);
  }
}

// ============================================================================
// WORKFLOW ERRORS
// ============================================================================

export class WorkflowNotFoundError extends TemplarError {
  readonly _tag = "WorkflowNotFoundError" as const;
  readonly code = "WORKFLOW_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.WORKFLOW_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.WORKFLOW_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.WORKFLOW_NOT_FOUND.domain;

  constructor(
    public readonly workflowId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Workflow '${workflowId}' not found`, metadata, traceId);
  }
}

export class WorkflowExecutionError extends TemplarError {
  readonly _tag = "WorkflowExecutionError" as const;
  readonly code = "WORKFLOW_EXECUTION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.WORKFLOW_EXECUTION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.WORKFLOW_EXECUTION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.WORKFLOW_EXECUTION_FAILED.domain;

  constructor(
    public readonly workflowId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Workflow '${workflowId}' execution failed: ${message}`, metadata, traceId);
  }
}

export class WorkflowInvalidStateError extends TemplarError {
  readonly _tag = "WorkflowInvalidStateError" as const;
  readonly code = "WORKFLOW_INVALID_STATE" as const;
  readonly httpStatus = ERROR_CATALOG.WORKFLOW_INVALID_STATE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.WORKFLOW_INVALID_STATE.grpcCode;
  readonly domain = ERROR_CATALOG.WORKFLOW_INVALID_STATE.domain;

  constructor(
    public readonly workflowId: string,
    public readonly currentState: string,
    public readonly expectedState: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Workflow '${workflowId}' is in state '${currentState}', expected '${expectedState}'`,
      metadata,
      traceId,
    );
  }
}

export class WorkflowStepError extends TemplarError {
  readonly _tag = "WorkflowStepError" as const;
  readonly code = "WORKFLOW_STEP_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.WORKFLOW_STEP_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.WORKFLOW_STEP_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.WORKFLOW_STEP_FAILED.domain;

  constructor(
    public readonly workflowId: string,
    public readonly stepName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Workflow '${workflowId}' step '${stepName}' failed: ${message}`, metadata, traceId);
  }
}

// ============================================================================
// DEPLOYMENT ERRORS
// ============================================================================

export class DeploymentError extends TemplarError {
  readonly _tag = "DeploymentError" as const;
  readonly code = "DEPLOYMENT_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.DEPLOYMENT_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.DEPLOYMENT_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.DEPLOYMENT_FAILED.domain;
}

export class DeploymentNotFoundError extends TemplarError {
  readonly _tag = "DeploymentNotFoundError" as const;
  readonly code = "DEPLOYMENT_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.DEPLOYMENT_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.DEPLOYMENT_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.DEPLOYMENT_NOT_FOUND.domain;

  constructor(
    public readonly deploymentId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Deployment '${deploymentId}' not found`, metadata, traceId);
  }
}

export class DeploymentConfigError extends TemplarError {
  readonly _tag = "DeploymentConfigError" as const;
  readonly code = "DEPLOYMENT_INVALID_CONFIG" as const;
  readonly httpStatus = ERROR_CATALOG.DEPLOYMENT_INVALID_CONFIG.httpStatus;
  readonly grpcCode = ERROR_CATALOG.DEPLOYMENT_INVALID_CONFIG.grpcCode;
  readonly domain = ERROR_CATALOG.DEPLOYMENT_INVALID_CONFIG.domain;
}

// ============================================================================
// QUOTA/RATE LIMIT ERRORS
// ============================================================================

export class QuotaExceededError extends TemplarError {
  readonly _tag = "QuotaExceededError" as const;
  readonly code = "QUOTA_EXCEEDED" as const;
  readonly httpStatus = ERROR_CATALOG.QUOTA_EXCEEDED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.QUOTA_EXCEEDED.grpcCode;
  readonly domain = ERROR_CATALOG.QUOTA_EXCEEDED.domain;

  constructor(
    public readonly quotaType: string,
    public readonly limit: number,
    public readonly current: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`${quotaType} quota exceeded (${current}/${limit})`, metadata, traceId);
  }
}

export class RateLimitExceededError extends TemplarError {
  readonly _tag = "RateLimitExceededError" as const;
  readonly code = "RATE_LIMIT_EXCEEDED" as const;
  readonly httpStatus = ERROR_CATALOG.RATE_LIMIT_EXCEEDED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RATE_LIMIT_EXCEEDED.grpcCode;
  readonly domain = ERROR_CATALOG.RATE_LIMIT_EXCEEDED.domain;

  constructor(
    public readonly retryAfterSeconds?: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    const retryMsg = retryAfterSeconds ? ` Retry after ${retryAfterSeconds} seconds.` : "";
    super(`Rate limit exceeded.${retryMsg}`, metadata, traceId);
  }
}

export class PayloadTooLargeError extends TemplarError {
  readonly _tag = "PayloadTooLargeError" as const;
  readonly code = "PAYLOAD_TOO_LARGE" as const;
  readonly httpStatus = ERROR_CATALOG.PAYLOAD_TOO_LARGE.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAYLOAD_TOO_LARGE.grpcCode;
  readonly domain = ERROR_CATALOG.PAYLOAD_TOO_LARGE.domain;

  constructor(
    public readonly sizeBytes: number,
    public readonly maxSizeBytes: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Payload size ${sizeBytes} bytes exceeds limit of ${maxSizeBytes} bytes`,
      metadata,
      traceId,
    );
  }
}

// ============================================================================
// APPLICATION-SPECIFIC ERRORS
// ============================================================================

/**
 * Thrown when Templar configuration is invalid
 */
export class TemplarConfigError extends TemplarError {
  readonly _tag = "TemplarConfigError" as const;
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_FAILED.domain;

  constructor(message: string, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
  }
}

/**
 * Thrown when Nexus client validation fails
 */
export class NexusClientError extends TemplarError {
  readonly _tag = "NexusClientError" as const;
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_FAILED.domain;

  constructor(message: string, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
  }
}

// ============================================================================
// PAY ERRORS
// ============================================================================

/**
 * Thrown when agent budget is exhausted and hard limit is active
 */
export class BudgetExhaustedError extends TemplarError {
  readonly _tag = "BudgetExhaustedError" as const;
  readonly code = "PAY_BUDGET_EXHAUSTED" as const;
  readonly httpStatus = ERROR_CATALOG.PAY_BUDGET_EXHAUSTED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAY_BUDGET_EXHAUSTED.grpcCode;
  readonly domain = ERROR_CATALOG.PAY_BUDGET_EXHAUSTED.domain;

  constructor(
    public readonly budget: number,
    public readonly spent: number,
    public readonly remaining: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Budget exhausted: spent ${spent} of ${budget} credits (${remaining} remaining)`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when a credit transfer (reserve/commit/release) fails
 */
export class PayTransferError extends TemplarError {
  readonly _tag = "PayTransferError" as const;
  readonly code = "PAY_TRANSFER_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.PAY_TRANSFER_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAY_TRANSFER_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.PAY_TRANSFER_FAILED.domain;

  constructor(
    public readonly phase: string,
    message: string,
    public readonly transferId?: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Transfer ${phase} failed${transferId ? ` (${transferId})` : ""}: ${message}`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when balance check fails
 */
export class PayBalanceCheckError extends TemplarError {
  readonly _tag = "PayBalanceCheckError" as const;
  readonly code = "PAY_BALANCE_CHECK_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.PAY_BALANCE_CHECK_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAY_BALANCE_CHECK_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.PAY_BALANCE_CHECK_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Balance check failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when pay middleware configuration is invalid
 */
export class PayConfigurationError extends TemplarError {
  readonly _tag = "PayConfigurationError" as const;
  readonly code = "PAY_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.PAY_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAY_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.PAY_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid pay configuration: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a credit reservation has expired
 */
export class PayReservationExpiredError extends TemplarError {
  readonly _tag = "PayReservationExpiredError" as const;
  readonly code = "PAY_RESERVATION_EXPIRED" as const;
  readonly httpStatus = ERROR_CATALOG.PAY_RESERVATION_EXPIRED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PAY_RESERVATION_EXPIRED.grpcCode;
  readonly domain = ERROR_CATALOG.PAY_RESERVATION_EXPIRED.domain;

  constructor(
    public readonly transferId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Credit reservation '${transferId}' has expired`, metadata, traceId);
  }
}

/**
 * Thrown when agent manifest validation fails
 */
export class ManifestValidationError extends TemplarError {
  readonly _tag = "ManifestValidationError" as const;
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_FAILED.domain;

  constructor(message: string, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
  }
}

// ============================================================================
// AUDIT ERRORS
// ============================================================================

/**
 * Thrown when a single audit event fails to write to the Nexus Event Log
 */
export class AuditWriteError extends TemplarError {
  readonly _tag = "AuditWriteError" as const;
  readonly code = "AUDIT_WRITE_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AUDIT_WRITE_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUDIT_WRITE_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AUDIT_WRITE_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Audit write failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a batch of audit events fails to write
 */
export class AuditBatchWriteError extends TemplarError {
  readonly _tag = "AuditBatchWriteError" as const;
  readonly code = "AUDIT_BATCH_WRITE_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AUDIT_BATCH_WRITE_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUDIT_BATCH_WRITE_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AUDIT_BATCH_WRITE_FAILED.domain;

  constructor(
    public readonly eventCount: number,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Audit batch write failed (${eventCount} events): ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when the audit event buffer exceeds its maximum capacity
 */
export class AuditBufferOverflowError extends TemplarError {
  readonly _tag = "AuditBufferOverflowError" as const;
  readonly code = "AUDIT_BUFFER_OVERFLOW" as const;
  readonly httpStatus = ERROR_CATALOG.AUDIT_BUFFER_OVERFLOW.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUDIT_BUFFER_OVERFLOW.grpcCode;
  readonly domain = ERROR_CATALOG.AUDIT_BUFFER_OVERFLOW.domain;

  constructor(
    public readonly bufferSize: number,
    public readonly maxSize: number,
    public readonly droppedCount: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Audit buffer overflow: ${bufferSize}/${maxSize} events, dropped ${droppedCount}`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when audit middleware configuration is invalid
 */
export class AuditConfigurationError extends TemplarError {
  readonly _tag = "AuditConfigurationError" as const;
  readonly code = "AUDIT_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.AUDIT_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUDIT_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.AUDIT_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid audit configuration: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when secret/PII redaction fails on an audit event
 */
export class AuditRedactionError extends TemplarError {
  readonly _tag = "AuditRedactionError" as const;
  readonly code = "AUDIT_REDACTION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AUDIT_REDACTION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AUDIT_REDACTION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AUDIT_REDACTION_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Audit redaction failed: ${message}`, metadata, traceId);
  }
}

// ============================================================================
// PERMISSION ERRORS
// ============================================================================

/**
 * Thrown when a tool call is denied by the permissions middleware
 */
export class PermissionDeniedError extends TemplarError {
  readonly _tag = "PermissionDeniedError" as const;
  readonly code = "PERMISSION_DENIED" as const;
  readonly httpStatus = ERROR_CATALOG.PERMISSION_DENIED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PERMISSION_DENIED.grpcCode;
  readonly domain = ERROR_CATALOG.PERMISSION_DENIED.domain;

  constructor(
    public readonly tool: string,
    public readonly action: string,
    public readonly reason?: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Permission denied: tool '${tool}' action '${action}'${reason ? ` — ${reason}` : ""}`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when a permission check against the ReBAC API fails
 */
export class PermissionCheckFailedError extends TemplarError {
  readonly _tag = "PermissionCheckFailedError" as const;
  readonly code = "PERMISSION_CHECK_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.PERMISSION_CHECK_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PERMISSION_CHECK_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.PERMISSION_CHECK_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Permission check failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a permission grant via the Nexus API fails
 */
export class PermissionGrantFailedError extends TemplarError {
  readonly _tag = "PermissionGrantFailedError" as const;
  readonly code = "PERMISSION_GRANT_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.PERMISSION_GRANT_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PERMISSION_GRANT_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.PERMISSION_GRANT_FAILED.domain;

  constructor(
    public readonly tool: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Permission grant failed for tool '${tool}': ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when permissions middleware configuration is invalid
 */
export class PermissionConfigurationError extends TemplarError {
  readonly _tag = "PermissionConfigurationError" as const;
  readonly code = "PERMISSION_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.PERMISSION_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.PERMISSION_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.PERMISSION_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid permission configuration: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a channel type is not registered in the ChannelRegistry
 */
export class ChannelNotFoundError extends TemplarError {
  readonly _tag = "ChannelNotFoundError" as const;
  readonly code = "RESOURCE_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.RESOURCE_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.RESOURCE_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.RESOURCE_NOT_FOUND.domain;

  constructor(channelType: string, options?: ErrorOptions) {
    super(
      `Channel type '${channelType}' not found. Did you forget to install @templar/channel-${channelType}?`,
      undefined,
      undefined,
      options,
    );
  }
}

/**
 * Thrown when a channel fails to load or is invalid
 */
export class ChannelLoadError extends TemplarError {
  readonly _tag = "ChannelLoadError" as const;
  readonly code = "INTERNAL_ERROR" as const;
  readonly httpStatus = ERROR_CATALOG.INTERNAL_ERROR.httpStatus;
  readonly grpcCode = ERROR_CATALOG.INTERNAL_ERROR.grpcCode;
  readonly domain = ERROR_CATALOG.INTERNAL_ERROR.domain;

  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super(`Failed to load channel '${channelType}': ${reason}`, undefined, undefined, options);
  }
}

/**
 * Thrown when sending a message through a channel fails at runtime
 */
export class ChannelSendError extends TemplarError {
  readonly _tag = "ChannelSendError" as const;
  readonly code = "CHANNEL_SEND_ERROR" as const;
  readonly httpStatus = ERROR_CATALOG.CHANNEL_SEND_ERROR.httpStatus;
  readonly grpcCode = ERROR_CATALOG.CHANNEL_SEND_ERROR.grpcCode;
  readonly domain = ERROR_CATALOG.CHANNEL_SEND_ERROR.domain;

  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super(`Failed to send via '${channelType}': ${reason}`, undefined, undefined, options);
  }
}

/**
 * Thrown when a message contains content blocks the channel does not support
 */
export class CapabilityNotSupportedError extends TemplarError {
  readonly _tag = "CapabilityNotSupportedError" as const;
  readonly code = "VALIDATION_CAPABILITY_NOT_SUPPORTED" as const;
  readonly httpStatus = ERROR_CATALOG.VALIDATION_CAPABILITY_NOT_SUPPORTED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.VALIDATION_CAPABILITY_NOT_SUPPORTED.grpcCode;
  readonly domain = ERROR_CATALOG.VALIDATION_CAPABILITY_NOT_SUPPORTED.domain;

  constructor(channelName: string, blockType: string, options?: ErrorOptions) {
    super(
      `Channel '${channelName}' does not support '${blockType}' content. Check adapter capabilities before sending.`,
      undefined,
      undefined,
      options,
    );
  }
}

// ============================================================================
// GATEWAY ERRORS
// ============================================================================

/**
 * Thrown when a node is not registered with the gateway
 */
export class GatewayNodeNotFoundError extends TemplarError {
  readonly _tag = "GatewayNodeNotFoundError" as const;
  readonly code = "GATEWAY_NODE_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_NODE_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_NODE_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_NODE_NOT_FOUND.domain;

  constructor(
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Node '${nodeId}' is not registered with the gateway`, metadata, traceId);
  }
}

/**
 * Thrown when attempting to register a node that already exists
 */
export class GatewayNodeAlreadyRegisteredError extends TemplarError {
  readonly _tag = "GatewayNodeAlreadyRegisteredError" as const;
  readonly code = "GATEWAY_NODE_ALREADY_REGISTERED" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_NODE_ALREADY_REGISTERED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_NODE_ALREADY_REGISTERED.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_NODE_ALREADY_REGISTERED.domain;

  constructor(
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Node '${nodeId}' is already registered with the gateway`, metadata, traceId);
  }
}

/**
 * Thrown when a node fails to authenticate with the gateway
 */
export class GatewayAuthFailedError extends TemplarError {
  readonly _tag = "GatewayAuthFailedError" as const;
  readonly code = "GATEWAY_AUTH_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_AUTH_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_AUTH_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_AUTH_FAILED.domain;

  constructor(
    public readonly reason: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Gateway authentication failed: ${reason}`, metadata, traceId);
  }
}

/**
 * Thrown when a session has expired and cannot be resumed
 */
export class GatewaySessionExpiredError extends TemplarError {
  readonly _tag = "GatewaySessionExpiredError" as const;
  readonly code = "GATEWAY_SESSION_EXPIRED" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_SESSION_EXPIRED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_SESSION_EXPIRED.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_SESSION_EXPIRED.domain;

  constructor(
    public readonly sessionId: string,
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Session '${sessionId}' for node '${nodeId}' has expired`, metadata, traceId);
  }
}

/**
 * Thrown when a session state transition is invalid
 */
export class GatewaySessionInvalidTransitionError extends TemplarError {
  readonly _tag = "GatewaySessionInvalidTransitionError" as const;
  readonly code = "GATEWAY_SESSION_INVALID_TRANSITION" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_SESSION_INVALID_TRANSITION.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_SESSION_INVALID_TRANSITION.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_SESSION_INVALID_TRANSITION.domain;

  constructor(
    public readonly currentState: string,
    public readonly event: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Invalid session transition: cannot apply '${event}' in state '${currentState}'`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when a lane queue drops a message due to overflow
 */
export class GatewayLaneOverflowError extends TemplarError {
  readonly _tag = "GatewayLaneOverflowError" as const;
  readonly code = "GATEWAY_LANE_OVERFLOW" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_LANE_OVERFLOW.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_LANE_OVERFLOW.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_LANE_OVERFLOW.domain;

  constructor(
    public readonly lane: string,
    public readonly nodeId: string,
    public readonly capacity: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Lane '${lane}' for node '${nodeId}' overflow (capacity: ${capacity})`,
      metadata,
      traceId,
    );
  }
}

/**
 * Thrown when gateway configuration is invalid
 */
export class GatewayConfigInvalidError extends TemplarError {
  readonly _tag = "GatewayConfigInvalidError" as const;
  readonly code = "GATEWAY_CONFIG_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_CONFIG_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_CONFIG_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_CONFIG_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid gateway configuration: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when config hot-reload fails
 */
export class GatewayConfigReloadFailedError extends TemplarError {
  readonly _tag = "GatewayConfigReloadFailedError" as const;
  readonly code = "GATEWAY_CONFIG_RELOAD_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_CONFIG_RELOAD_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_CONFIG_RELOAD_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_CONFIG_RELOAD_FAILED.domain;

  constructor(
    public readonly configPath: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Config reload failed for '${configPath}': ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a node fails to respond to heartbeat
 */
export class GatewayHeartbeatTimeoutError extends TemplarError {
  readonly _tag = "GatewayHeartbeatTimeoutError" as const;
  readonly code = "GATEWAY_HEARTBEAT_TIMEOUT" as const;
  readonly httpStatus = ERROR_CATALOG.GATEWAY_HEARTBEAT_TIMEOUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.GATEWAY_HEARTBEAT_TIMEOUT.grpcCode;
  readonly domain = ERROR_CATALOG.GATEWAY_HEARTBEAT_TIMEOUT.domain;

  constructor(
    public readonly nodeId: string,
    public readonly intervalMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Node '${nodeId}' failed to respond to heartbeat within ${intervalMs}ms`,
      metadata,
      traceId,
    );
  }
}

// ============================================================================
// AG-UI ERRORS
// ============================================================================

/**
 * Thrown when RunAgentInput validation fails
 */
export class AguiInvalidInputError extends TemplarError {
  readonly _tag = "AguiInvalidInputError" as const;
  readonly code = "AGUI_INVALID_INPUT" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_INVALID_INPUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_INVALID_INPUT.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_INVALID_INPUT.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid AG-UI input: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a client disconnects during an active SSE stream
 */
export class AguiStreamInterruptedError extends TemplarError {
  readonly _tag = "AguiStreamInterruptedError" as const;
  readonly code = "AGUI_STREAM_INTERRUPTED" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_STREAM_INTERRUPTED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_STREAM_INTERRUPTED.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_STREAM_INTERRUPTED.domain;

  constructor(
    public readonly runId: string,
    public readonly threadId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Stream interrupted for run '${runId}' on thread '${threadId}'`, metadata, traceId);
  }
}

/**
 * Thrown when SSE event encoding fails
 */
export class AguiEncodingFailedError extends TemplarError {
  readonly _tag = "AguiEncodingFailedError" as const;
  readonly code = "AGUI_ENCODING_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_ENCODING_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_ENCODING_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_ENCODING_FAILED.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`AG-UI encoding failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when an agent run exceeds the maximum stream duration
 */
export class AguiRunTimeoutError extends TemplarError {
  readonly _tag = "AguiRunTimeoutError" as const;
  readonly code = "AGUI_RUN_TIMEOUT" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_RUN_TIMEOUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_RUN_TIMEOUT.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_RUN_TIMEOUT.domain;

  constructor(
    public readonly runId: string,
    public readonly maxDurationMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Run '${runId}' exceeded maximum duration of ${maxDurationMs}ms`, metadata, traceId);
  }
}

/**
 * Thrown when an agent run fails during execution
 */
export class AguiRunFailedError extends TemplarError {
  readonly _tag = "AguiRunFailedError" as const;
  readonly code = "AGUI_RUN_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_RUN_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_RUN_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_RUN_FAILED.domain;

  constructor(
    public readonly runId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Run '${runId}' failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when the AG-UI server has reached its maximum concurrent connections
 */
export class AguiConnectionLimitReachedError extends TemplarError {
  readonly _tag = "AguiConnectionLimitReachedError" as const;
  readonly code = "AGUI_CONNECTION_LIMIT_REACHED" as const;
  readonly httpStatus = ERROR_CATALOG.AGUI_CONNECTION_LIMIT_REACHED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.AGUI_CONNECTION_LIMIT_REACHED.grpcCode;
  readonly domain = ERROR_CATALOG.AGUI_CONNECTION_LIMIT_REACHED.domain;

  constructor(
    public readonly maxConnections: number,
    public readonly currentConnections: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Connection limit reached: ${currentConnections}/${maxConnections} active connections`,
      metadata,
      traceId,
    );
  }
}

// ============================================================================
// HOOK ERRORS
// ============================================================================

/**
 * Thrown when hook registry configuration is invalid
 */
export class HookConfigurationError extends TemplarError {
  readonly _tag = "HookConfigurationError" as const;
  readonly code = "HOOK_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.HOOK_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.HOOK_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.HOOK_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Invalid hook configuration: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a hook handler throws during execution
 */
export class HookExecutionError extends TemplarError {
  readonly _tag = "HookExecutionError" as const;
  readonly code = "HOOK_EXECUTION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.HOOK_EXECUTION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.HOOK_EXECUTION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.HOOK_EXECUTION_FAILED.domain;

  constructor(
    public readonly hookEvent: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Hook '${hookEvent}' execution failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a hook handler exceeds the configured timeout
 */
export class HookTimeoutError extends TemplarError {
  readonly _tag = "HookTimeoutError" as const;
  readonly code = "HOOK_TIMEOUT" as const;
  readonly httpStatus = ERROR_CATALOG.HOOK_TIMEOUT.httpStatus;
  readonly grpcCode = ERROR_CATALOG.HOOK_TIMEOUT.grpcCode;
  readonly domain = ERROR_CATALOG.HOOK_TIMEOUT.domain;

  constructor(
    public readonly hookEvent: string,
    public readonly timeoutMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`Hook '${hookEvent}' exceeded timeout of ${timeoutMs}ms`, metadata, traceId);
  }
}

/**
 * Thrown when hook emit() calls exceed the maximum re-entrancy depth
 */
export class HookReentrancyError extends TemplarError {
  readonly _tag = "HookReentrancyError" as const;
  readonly code = "HOOK_REENTRANCY_EXCEEDED" as const;
  readonly httpStatus = ERROR_CATALOG.HOOK_REENTRANCY_EXCEEDED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.HOOK_REENTRANCY_EXCEEDED.grpcCode;
  readonly domain = ERROR_CATALOG.HOOK_REENTRANCY_EXCEEDED.domain;

  constructor(
    public readonly hookEvent: string,
    public readonly depth: number,
    public readonly maxDepth: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Hook '${hookEvent}' re-entrancy depth ${depth} exceeds maximum ${maxDepth}`,
      metadata,
      traceId,
    );
  }
}

// ============================================================================
// MCP ERRORS
// ============================================================================

/**
 * Thrown when a connection to an MCP server fails
 */
export class McpConnectionFailedError extends TemplarError {
  readonly _tag = "McpConnectionFailedError" as const;
  readonly code = "MCP_CONNECTION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_CONNECTION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_CONNECTION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_CONNECTION_FAILED.domain;

  constructor(
    public readonly serverName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP server '${serverName}' connection failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when MCP protocol handshake or capability negotiation fails
 */
export class McpInitializationFailedError extends TemplarError {
  readonly _tag = "McpInitializationFailedError" as const;
  readonly code = "MCP_INITIALIZATION_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_INITIALIZATION_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_INITIALIZATION_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_INITIALIZATION_FAILED.domain;

  constructor(
    public readonly serverName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP server '${serverName}' initialization failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when an MCP tool invocation returns an error
 */
export class McpToolCallFailedError extends TemplarError {
  readonly _tag = "McpToolCallFailedError" as const;
  readonly code = "MCP_TOOL_CALL_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_TOOL_CALL_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_TOOL_CALL_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_TOOL_CALL_FAILED.domain;

  constructor(
    public readonly toolName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP tool '${toolName}' call failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when the requested tool does not exist on the MCP server
 */
export class McpToolNotFoundError extends TemplarError {
  readonly _tag = "McpToolNotFoundError" as const;
  readonly code = "MCP_TOOL_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_TOOL_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_TOOL_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_TOOL_NOT_FOUND.domain;

  constructor(
    public readonly toolName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP tool '${toolName}' not found on server`, metadata, traceId);
  }
}

/**
 * Thrown when the requested resource URI was not found on the MCP server
 */
export class McpResourceNotFoundError extends TemplarError {
  readonly _tag = "McpResourceNotFoundError" as const;
  readonly code = "MCP_RESOURCE_NOT_FOUND" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_RESOURCE_NOT_FOUND.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_RESOURCE_NOT_FOUND.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_RESOURCE_NOT_FOUND.domain;

  constructor(
    public readonly uri: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP resource '${uri}' not found`, metadata, traceId);
  }
}

/**
 * Thrown when reading a resource from the MCP server fails
 */
export class McpResourceReadFailedError extends TemplarError {
  readonly _tag = "McpResourceReadFailedError" as const;
  readonly code = "MCP_RESOURCE_READ_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_RESOURCE_READ_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_RESOURCE_READ_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_RESOURCE_READ_FAILED.domain;

  constructor(
    public readonly uri: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP resource '${uri}' read failed: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when a transport-level communication error occurs
 */
export class McpTransportError extends TemplarError {
  readonly _tag = "McpTransportError" as const;
  readonly code = "MCP_TRANSPORT_ERROR" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_TRANSPORT_ERROR.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_TRANSPORT_ERROR.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_TRANSPORT_ERROR.domain;

  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP transport error: ${message}`, metadata, traceId);
  }
}

/**
 * Thrown when the MCP server connection is lost unexpectedly
 */
export class McpServerDisconnectedError extends TemplarError {
  readonly _tag = "McpServerDisconnectedError" as const;
  readonly code = "MCP_SERVER_DISCONNECTED" as const;
  readonly httpStatus = ERROR_CATALOG.MCP_SERVER_DISCONNECTED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.MCP_SERVER_DISCONNECTED.grpcCode;
  readonly domain = ERROR_CATALOG.MCP_SERVER_DISCONNECTED.domain;

  constructor(
    public readonly serverName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(`MCP server '${serverName}' disconnected unexpectedly`, metadata, traceId);
  }
}

// ============================================================================
// SANITIZE ERRORS
// ============================================================================

/**
 * Thrown when the sanitizer configuration is invalid
 */
export class SanitizeConfigurationError extends TemplarError {
  readonly _tag = "SanitizeConfigurationError" as const;
  readonly code = "SANITIZE_CONFIGURATION_INVALID" as const;
  readonly httpStatus = ERROR_CATALOG.SANITIZE_CONFIGURATION_INVALID.httpStatus;
  readonly grpcCode = ERROR_CATALOG.SANITIZE_CONFIGURATION_INVALID.grpcCode;
  readonly domain = ERROR_CATALOG.SANITIZE_CONFIGURATION_INVALID.domain;

  constructor(
    message: string,
    public readonly issues?: readonly string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(message, metadata, traceId);
  }
}

/**
 * Thrown when a sanitization rule throws an unexpected error during execution
 */
export class SanitizeRuleFailedError extends TemplarError {
  readonly _tag = "SanitizeRuleFailedError" as const;
  readonly code = "SANITIZE_RULE_FAILED" as const;
  readonly httpStatus = ERROR_CATALOG.SANITIZE_RULE_FAILED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.SANITIZE_RULE_FAILED.grpcCode;
  readonly domain = ERROR_CATALOG.SANITIZE_RULE_FAILED.domain;

  constructor(
    public readonly ruleName: string,
    message: string,
    metadata?: Record<string, string>,
    traceId?: string,
    cause?: Error,
  ) {
    super(`Rule '${ruleName}' failed: ${message}`, metadata, traceId, {
      cause,
    });
  }
}

/**
 * Thrown when content is blocked due to size limits or being entirely malicious
 */
export class SanitizeContentBlockedError extends TemplarError {
  readonly _tag = "SanitizeContentBlockedError" as const;
  readonly code = "SANITIZE_CONTENT_BLOCKED" as const;
  readonly httpStatus = ERROR_CATALOG.SANITIZE_CONTENT_BLOCKED.httpStatus;
  readonly grpcCode = ERROR_CATALOG.SANITIZE_CONTENT_BLOCKED.grpcCode;
  readonly domain = ERROR_CATALOG.SANITIZE_CONTENT_BLOCKED.domain;

  constructor(
    public readonly reason: string,
    public readonly contentLength: number,
    public readonly maxLength: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super(
      `Content blocked: ${reason} (length: ${contentLength}, max: ${maxLength})`,
      metadata,
      traceId,
    );
  }
}
