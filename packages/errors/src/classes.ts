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
    public readonly cause?: Error,
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
    public readonly cause?: Error,
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
    public readonly cause?: Error,
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
