/**
 * Legacy error class aliases (backward compatibility).
 *
 * Each class is a thin deprecated wrapper extending the appropriate base type.
 * Constructor signatures match the original classes in classes.ts exactly.
 *
 * Migration: Replace `new XxxError(...)` with `new BaseType({ code: "XXX_CODE", ... })`.
 * Phase 2 will codemod `instanceof XxxError` to `.code === "XXX_CODE"`.
 *
 * @deprecated All classes in this file are deprecated. Use the 8 base types from ./bases/ instead.
 */

import { ConflictError } from "./bases/conflict-error.js";
import { ExternalError } from "./bases/external-error.js";
import { InternalError } from "./bases/internal-error.js";
import { NotFoundError } from "./bases/not-found-error.js";
import { PermissionError } from "./bases/permission-error.js";
import { RateLimitError } from "./bases/rate-limit-error.js";
import { TimeoutError } from "./bases/timeout-error.js";
import { ValidationError } from "./bases/validation-error.js";

// Re-export ValidationIssue for backward compat (was in classes.ts)
export type { ValidationIssue } from "./types.js";

// ============================================================================
// INTERNAL ERRORS
// ============================================================================

/** @deprecated Use `new InternalError("message")` */
export class LegacyInternalError extends InternalError<"INTERNAL_ERROR"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "INTERNAL_ERROR", message, metadata, traceId });
  }
}

/** @deprecated Use `new InternalError({ code: "INTERNAL_NOT_IMPLEMENTED", ... })` */
export class NotImplementedError extends InternalError<"INTERNAL_NOT_IMPLEMENTED"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "INTERNAL_NOT_IMPLEMENTED", message, metadata, traceId });
  }
}

/** @deprecated Use `new ExternalError("message")` */
export class ServiceUnavailableError extends ExternalError<"INTERNAL_UNAVAILABLE"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "INTERNAL_UNAVAILABLE", message, metadata, traceId });
  }
}

/** @deprecated Use `new TimeoutError("message")` */
export class LegacyTimeoutError extends TimeoutError<"INTERNAL_TIMEOUT"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "INTERNAL_TIMEOUT", message, metadata, traceId });
  }
}

// ============================================================================
// AUTH ERRORS
// ============================================================================

/** @deprecated Use `new PermissionError({ code: "AUTH_TOKEN_EXPIRED", ... })` */
export class TokenExpiredError extends PermissionError<"AUTH_TOKEN_EXPIRED"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "AUTH_TOKEN_EXPIRED", message, metadata, traceId });
  }
}

/** @deprecated Use `new PermissionError({ code: "AUTH_TOKEN_INVALID", ... })` */
export class TokenInvalidError extends PermissionError<"AUTH_TOKEN_INVALID"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "AUTH_TOKEN_INVALID", message, metadata, traceId });
  }
}

/** @deprecated Use `new PermissionError({ code: "AUTH_TOKEN_MISSING", ... })` */
export class TokenMissingError extends PermissionError<"AUTH_TOKEN_MISSING"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "AUTH_TOKEN_MISSING", message, metadata, traceId });
  }
}

/** @deprecated Use `new PermissionError({ code: "AUTH_INSUFFICIENT_SCOPE", ... })` */
export class InsufficientScopeError extends PermissionError<"AUTH_INSUFFICIENT_SCOPE"> {
  constructor(
    message: string,
    public readonly requiredScopes: string[],
    public readonly actualScopes: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({ code: "AUTH_INSUFFICIENT_SCOPE", message, metadata, traceId });
  }
}

/** @deprecated Use `new PermissionError({ code: "AUTH_FORBIDDEN", ... })` */
export class ForbiddenError extends PermissionError<"AUTH_FORBIDDEN"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "AUTH_FORBIDDEN", message, metadata, traceId });
  }
}

// ============================================================================
// RESOURCE ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError("type", "id")` */
export class LegacyNotFoundError extends NotFoundError<"RESOURCE_NOT_FOUND"> {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "RESOURCE_NOT_FOUND",
      message: `${resourceType} with ID '${resourceId}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "RESOURCE_ALREADY_EXISTS", ... })` */
export class AlreadyExistsError extends ConflictError<"RESOURCE_ALREADY_EXISTS"> {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "RESOURCE_ALREADY_EXISTS",
      message: `${resourceType} with ID '${resourceId}' already exists`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ConflictError("message")` */
export class ResourceConflictError extends ConflictError<"RESOURCE_CONFLICT"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "RESOURCE_CONFLICT", message, metadata, traceId });
  }
}

/** @deprecated Use `new NotFoundError({ code: "RESOURCE_GONE", ... })` */
export class ResourceGoneError extends NotFoundError<"RESOURCE_GONE"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "RESOURCE_GONE", message, metadata, traceId });
  }
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

/** @deprecated Use `new ValidationError("message", issues)` */
export class LegacyValidationError extends ValidationError<"VALIDATION_FAILED"> {
  constructor(
    message: string,
    issues: import("./types.js").ValidationIssue[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({ code: "VALIDATION_FAILED", message, metadata, traceId, issues });
  }
}

/** @deprecated Use `new ValidationError({ code: "VALIDATION_REQUIRED_FIELD", ... })` */
export class RequiredFieldError extends ValidationError<"VALIDATION_REQUIRED_FIELD"> {
  constructor(
    public readonly fieldName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "VALIDATION_REQUIRED_FIELD",
      message: `Required field '${fieldName}' is missing`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "VALIDATION_INVALID_FORMAT", ... })` */
export class InvalidFormatError extends ValidationError<"VALIDATION_INVALID_FORMAT"> {
  constructor(
    public readonly fieldName: string,
    public readonly expectedFormat: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "VALIDATION_INVALID_FORMAT",
      message: `Field '${fieldName}' has invalid format, expected ${expectedFormat}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "VALIDATION_OUT_OF_RANGE", ... })` */
export class OutOfRangeError extends ValidationError<"VALIDATION_OUT_OF_RANGE"> {
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
    super({
      code: "VALIDATION_OUT_OF_RANGE",
      message: `Field '${fieldName}' value ${value} is out of range (${range})`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// AGENT ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "AGENT_NOT_FOUND", ... })` */
export class AgentNotFoundError extends NotFoundError<"AGENT_NOT_FOUND"> {
  constructor(
    public readonly agentId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({ code: "AGENT_NOT_FOUND", message: `Agent '${agentId}' not found`, metadata, traceId });
  }
}

/** @deprecated Use `new ExternalError({ code: "AGENT_EXECUTION_FAILED", ... })` */
export class AgentExecutionError extends ExternalError<"AGENT_EXECUTION_FAILED"> {
  constructor(
    public readonly agentId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGENT_EXECUTION_FAILED",
      message: `Agent '${agentId}' execution failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "AGENT_EXECUTION_TIMEOUT", ... })` */
export class AgentTimeoutError extends TimeoutError<"AGENT_EXECUTION_TIMEOUT"> {
  constructor(
    public readonly agentId: string,
    public readonly timeoutMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGENT_EXECUTION_TIMEOUT",
      message: `Agent '${agentId}' execution timed out after ${timeoutMs}ms`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "AGENT_INVALID_STATE", ... })` */
export class AgentInvalidStateError extends ConflictError<"AGENT_INVALID_STATE"> {
  constructor(
    public readonly agentId: string,
    public readonly currentState: string,
    public readonly expectedState: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGENT_INVALID_STATE",
      message: `Agent '${agentId}' is in state '${currentState}', expected '${expectedState}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "AGENT_CONFIGURATION_INVALID", ... })` */
export class AgentConfigurationError extends ValidationError<"AGENT_CONFIGURATION_INVALID"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "AGENT_CONFIGURATION_INVALID", message, metadata, traceId });
  }
}

// ============================================================================
// MEMORY ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "MEMORY_NOT_FOUND", ... })` */
export class MemoryNotFoundError extends NotFoundError<"MEMORY_NOT_FOUND"> {
  constructor(
    public readonly memoryId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MEMORY_NOT_FOUND",
      message: `Memory '${memoryId}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MEMORY_STORE_FAILED", ... })` */
export class MemoryStoreError extends ExternalError<"MEMORY_STORE_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MEMORY_STORE_FAILED",
      message: `Memory store failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MEMORY_SEARCH_FAILED", ... })` */
export class MemorySearchError extends ExternalError<"MEMORY_SEARCH_FAILED"> {
  constructor(
    public readonly query: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MEMORY_SEARCH_FAILED",
      message: `Memory search failed for query '${query}'`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "MEMORY_CONFIGURATION_INVALID", ... })` */
export class MemoryConfigurationError extends ValidationError<"MEMORY_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MEMORY_CONFIGURATION_INVALID",
      message: `Invalid memory configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "MEMORY_BATCH_PARTIAL", ... })` */
export class MemoryBatchError extends ExternalError<"MEMORY_BATCH_PARTIAL"> {
  constructor(
    public readonly stored: number,
    public readonly failed: number,
    public readonly errors: Array<{ index: number; error: string }>,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MEMORY_BATCH_PARTIAL",
      message: `Batch store partial failure: ${stored} stored, ${failed} failed`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// ENTITY ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "ENTITY_NOT_FOUND", ... })` */
export class EntityNotFoundError extends NotFoundError<"ENTITY_NOT_FOUND"> {
  constructor(
    public readonly entityId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "ENTITY_NOT_FOUND",
      message: `Entity '${entityId}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "ENTITY_TRACK_FAILED", ... })` */
export class EntityTrackError extends ExternalError<"ENTITY_TRACK_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "ENTITY_TRACK_FAILED",
      message: `Entity track failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "ENTITY_DUPLICATE", ... })` */
export class EntityDuplicateError extends ConflictError<"ENTITY_DUPLICATE"> {
  constructor(
    public readonly entityName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "ENTITY_DUPLICATE",
      message: `Ambiguous entity match for '${entityName}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "ENTITY_CONFIGURATION_INVALID", ... })` */
export class EntityConfigurationError extends ValidationError<"ENTITY_CONFIGURATION_INVALID"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({
      code: "ENTITY_CONFIGURATION_INVALID",
      message: `Invalid entity memory configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "ENTITY_EXTRACTION_FAILED", ... })` */
export class EntityExtractionError extends ExternalError<"ENTITY_EXTRACTION_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "ENTITY_EXTRACTION_FAILED",
      message: `Entity extraction failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

// ============================================================================
// WORKFLOW ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "WORKFLOW_NOT_FOUND", ... })` */
export class WorkflowNotFoundError extends NotFoundError<"WORKFLOW_NOT_FOUND"> {
  constructor(
    public readonly workflowId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "WORKFLOW_NOT_FOUND",
      message: `Workflow '${workflowId}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "WORKFLOW_EXECUTION_FAILED", ... })` */
export class WorkflowExecutionError extends ExternalError<"WORKFLOW_EXECUTION_FAILED"> {
  constructor(
    public readonly workflowId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "WORKFLOW_EXECUTION_FAILED",
      message: `Workflow '${workflowId}' execution failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "WORKFLOW_INVALID_STATE", ... })` */
export class WorkflowInvalidStateError extends ConflictError<"WORKFLOW_INVALID_STATE"> {
  constructor(
    public readonly workflowId: string,
    public readonly currentState: string,
    public readonly expectedState: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "WORKFLOW_INVALID_STATE",
      message: `Workflow '${workflowId}' is in state '${currentState}', expected '${expectedState}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "WORKFLOW_STEP_FAILED", ... })` */
export class WorkflowStepError extends ExternalError<"WORKFLOW_STEP_FAILED"> {
  constructor(
    public readonly workflowId: string,
    public readonly stepName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "WORKFLOW_STEP_FAILED",
      message: `Workflow '${workflowId}' step '${stepName}' failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

// ============================================================================
// DEPLOYMENT ERRORS
// ============================================================================

/** @deprecated Use `new ExternalError({ code: "DEPLOYMENT_FAILED", ... })` */
export class DeploymentError extends ExternalError<"DEPLOYMENT_FAILED"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "DEPLOYMENT_FAILED", message, metadata, traceId });
  }
}

/** @deprecated Use `new NotFoundError({ code: "DEPLOYMENT_NOT_FOUND", ... })` */
export class DeploymentNotFoundError extends NotFoundError<"DEPLOYMENT_NOT_FOUND"> {
  constructor(
    public readonly deploymentId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "DEPLOYMENT_NOT_FOUND",
      message: `Deployment '${deploymentId}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "DEPLOYMENT_INVALID_CONFIG", ... })` */
export class DeploymentConfigError extends ValidationError<"DEPLOYMENT_INVALID_CONFIG"> {
  constructor(message: string, metadata?: Record<string, string>, traceId?: string) {
    super({ code: "DEPLOYMENT_INVALID_CONFIG", message, metadata, traceId });
  }
}

// ============================================================================
// QUOTA/RATE LIMIT ERRORS
// ============================================================================

/** @deprecated Use `new RateLimitError({ code: "QUOTA_EXCEEDED", ... })` */
export class QuotaExceededError extends RateLimitError<"QUOTA_EXCEEDED"> {
  constructor(
    public readonly quotaType: string,
    public readonly limit: number,
    public readonly current: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "QUOTA_EXCEEDED",
      message: `${quotaType} quota exceeded (${current}/${limit})`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "RATE_LIMIT_EXCEEDED", ... })` */
export class RateLimitExceededError extends RateLimitError<"RATE_LIMIT_EXCEEDED"> {
  constructor(
    public readonly retryAfterSeconds?: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    const retryMsg = retryAfterSeconds ? ` Retry after ${retryAfterSeconds} seconds.` : "";
    super({
      code: "RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded.${retryMsg}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "PAYLOAD_TOO_LARGE", ... })` */
export class PayloadTooLargeError extends RateLimitError<"PAYLOAD_TOO_LARGE"> {
  constructor(
    public readonly sizeBytes: number,
    public readonly maxSizeBytes: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAYLOAD_TOO_LARGE",
      message: `Payload size ${sizeBytes} bytes exceeds limit of ${maxSizeBytes} bytes`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// APPLICATION-SPECIFIC ERRORS
// ============================================================================

/** @deprecated Use `new ValidationError({ code: "TEMPLAR_CONFIG_INVALID", ... })` */
export class TemplarConfigError extends ValidationError<"TEMPLAR_CONFIG_INVALID"> {
  constructor(message: string, options?: ErrorOptions) {
    super({
      code: "TEMPLAR_CONFIG_INVALID",
      message,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "NEXUS_CLIENT_ERROR", ... })` */
export class NexusClientError extends ValidationError<"NEXUS_CLIENT_ERROR"> {
  constructor(message: string, options?: ErrorOptions) {
    super({
      code: "NEXUS_CLIENT_ERROR",
      message,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "VALIDATION_FAILED", ... })` */
export class ManifestValidationError extends ValidationError<"VALIDATION_FAILED"> {
  constructor(message: string, options?: ErrorOptions) {
    super({
      code: "VALIDATION_FAILED",
      message,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

// ============================================================================
// PAY ERRORS
// ============================================================================

/** @deprecated Use `new RateLimitError({ code: "PAY_BUDGET_EXHAUSTED", ... })` */
export class BudgetExhaustedError extends RateLimitError<"PAY_BUDGET_EXHAUSTED"> {
  constructor(
    public readonly budget: number,
    public readonly spent: number,
    public readonly remaining: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAY_BUDGET_EXHAUSTED",
      message: `Budget exhausted: spent ${spent} of ${budget} credits (${remaining} remaining)`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "PAY_TRANSFER_FAILED", ... })` */
export class PayTransferError extends ExternalError<"PAY_TRANSFER_FAILED"> {
  constructor(
    public readonly phase: string,
    message: string,
    public readonly transferId?: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAY_TRANSFER_FAILED",
      message: `Transfer ${phase} failed${transferId ? ` (${transferId})` : ""}: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "PAY_BALANCE_CHECK_FAILED", ... })` */
export class PayBalanceCheckError extends ExternalError<"PAY_BALANCE_CHECK_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAY_BALANCE_CHECK_FAILED",
      message: `Balance check failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "PAY_CONFIGURATION_INVALID", ... })` */
export class PayConfigurationError extends ValidationError<"PAY_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAY_CONFIGURATION_INVALID",
      message: `Invalid pay configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ConflictError({ code: "PAY_RESERVATION_EXPIRED", ... })` */
export class PayReservationExpiredError extends ConflictError<"PAY_RESERVATION_EXPIRED"> {
  constructor(
    public readonly transferId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PAY_RESERVATION_EXPIRED",
      message: `Credit reservation '${transferId}' has expired`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// AUDIT ERRORS
// ============================================================================

/** @deprecated Use `new ExternalError({ code: "AUDIT_WRITE_FAILED", ... })` */
export class AuditWriteError extends ExternalError<"AUDIT_WRITE_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AUDIT_WRITE_FAILED",
      message: `Audit write failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "AUDIT_BATCH_WRITE_FAILED", ... })` */
export class AuditBatchWriteError extends ExternalError<"AUDIT_BATCH_WRITE_FAILED"> {
  constructor(
    public readonly eventCount: number,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AUDIT_BATCH_WRITE_FAILED",
      message: `Audit batch write failed (${eventCount} events): ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "AUDIT_BUFFER_OVERFLOW", ... })` */
export class AuditBufferOverflowError extends RateLimitError<"AUDIT_BUFFER_OVERFLOW"> {
  constructor(
    public readonly bufferSize: number,
    public readonly maxSize: number,
    public readonly droppedCount: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AUDIT_BUFFER_OVERFLOW",
      message: `Audit buffer overflow: ${bufferSize}/${maxSize} events, dropped ${droppedCount}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "AUDIT_CONFIGURATION_INVALID", ... })` */
export class AuditConfigurationError extends ValidationError<"AUDIT_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AUDIT_CONFIGURATION_INVALID",
      message: `Invalid audit configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "AUDIT_REDACTION_FAILED", ... })` */
export class AuditRedactionError extends ExternalError<"AUDIT_REDACTION_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AUDIT_REDACTION_FAILED",
      message: `Audit redaction failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

// ============================================================================
// PERMISSION ERRORS
// ============================================================================

/** @deprecated Use `new PermissionError({ code: "PERMISSION_DENIED", ... })` */
export class PermissionDeniedError extends PermissionError<"PERMISSION_DENIED"> {
  constructor(
    public readonly tool: string,
    public readonly action: string,
    public readonly reason?: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PERMISSION_DENIED",
      message: `Permission denied: tool '${tool}' action '${action}'${reason ? ` — ${reason}` : ""}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "PERMISSION_CHECK_FAILED", ... })` */
export class PermissionCheckFailedError extends ExternalError<"PERMISSION_CHECK_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PERMISSION_CHECK_FAILED",
      message: `Permission check failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "PERMISSION_GRANT_FAILED", ... })` */
export class PermissionGrantFailedError extends ExternalError<"PERMISSION_GRANT_FAILED"> {
  constructor(
    public readonly tool: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PERMISSION_GRANT_FAILED",
      message: `Permission grant failed for tool '${tool}': ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "PERMISSION_CONFIGURATION_INVALID", ... })` */
export class PermissionConfigurationError extends ValidationError<"PERMISSION_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "PERMISSION_CONFIGURATION_INVALID",
      message: `Invalid permission configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

// ============================================================================
// CHANNEL ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "CHANNEL_NOT_FOUND", ... })` */
export class ChannelNotFoundError extends NotFoundError<"CHANNEL_NOT_FOUND"> {
  constructor(channelType: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_NOT_FOUND",
      message: `Channel type '${channelType}' not found. Did you forget to install @templar/channel-${channelType}?`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "CHANNEL_LOAD_FAILED", ... })` */
export class ChannelLoadError extends ExternalError<"CHANNEL_LOAD_FAILED"> {
  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_LOAD_FAILED",
      message: `Failed to load channel '${channelType}': ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "CHANNEL_SEND_ERROR", ... })` */
export class ChannelSendError extends ExternalError<"CHANNEL_SEND_ERROR"> {
  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_SEND_ERROR",
      message: `Failed to send via '${channelType}': ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "VALIDATION_CAPABILITY_NOT_SUPPORTED", ... })` */
export class CapabilityNotSupportedError extends ValidationError<"VALIDATION_CAPABILITY_NOT_SUPPORTED"> {
  constructor(channelName: string, blockType: string, options?: ErrorOptions) {
    super({
      code: "VALIDATION_CAPABILITY_NOT_SUPPORTED",
      message: `Channel '${channelName}' does not support '${blockType}' content. Check adapter capabilities before sending.`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new PermissionError({ code: "CHANNEL_AUTH_EXPIRED", ... })` */
export class ChannelAuthExpiredError extends PermissionError<"CHANNEL_AUTH_EXPIRED"> {
  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_AUTH_EXPIRED",
      message: `Channel '${channelType}' auth expired: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new PermissionError({ code: "CHANNEL_AUTH_REQUIRED", ... })` */
export class ChannelAuthRequiredError extends PermissionError<"CHANNEL_AUTH_REQUIRED"> {
  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_AUTH_REQUIRED",
      message: `Channel '${channelType}' requires authentication: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "CHANNEL_SESSION_REPLACED", ... })` */
export class ChannelSessionReplacedError extends ConflictError<"CHANNEL_SESSION_REPLACED"> {
  constructor(channelType: string, reason: string, options?: ErrorOptions) {
    super({
      code: "CHANNEL_SESSION_REPLACED",
      message: `Channel '${channelType}' session replaced: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

// ============================================================================
// VOICE ERRORS
// ============================================================================

/** @deprecated Use `new ExternalError({ code: "VOICE_CONNECTION_FAILED", ... })` */
export class VoiceConnectionFailedError extends ExternalError<"VOICE_CONNECTION_FAILED"> {
  constructor(reason: string, options?: ErrorOptions) {
    super({
      code: "VOICE_CONNECTION_FAILED",
      message: `Voice connection failed: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "VOICE_PIPELINE_ERROR", ... })` */
export class VoicePipelineError extends ExternalError<"VOICE_PIPELINE_ERROR"> {
  constructor(reason: string, options?: ErrorOptions) {
    super({
      code: "VOICE_PIPELINE_ERROR",
      message: `Voice pipeline error: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "VOICE_ROOM_ERROR", ... })` */
export class VoiceRoomError extends ExternalError<"VOICE_ROOM_ERROR"> {
  constructor(reason: string, options?: ErrorOptions) {
    super({
      code: "VOICE_ROOM_ERROR",
      message: `Voice room error: ${reason}`,
      ...(options?.cause instanceof Error ? { cause: options.cause } : {}),
    });
  }
}

// ============================================================================
// GATEWAY ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "GATEWAY_NODE_NOT_FOUND", ... })` */
export class GatewayNodeNotFoundError extends NotFoundError<"GATEWAY_NODE_NOT_FOUND"> {
  constructor(
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_NODE_NOT_FOUND",
      message: `Node '${nodeId}' is not registered with the gateway`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new NotFoundError({ code: "GATEWAY_AGENT_NOT_FOUND", ... })` */
export class GatewayAgentNotFoundError extends NotFoundError<"GATEWAY_AGENT_NOT_FOUND"> {
  constructor(
    public readonly agentId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_AGENT_NOT_FOUND",
      message: `Agent '${agentId}' is not served by any registered node`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "GATEWAY_NODE_ALREADY_REGISTERED", ... })` */
export class GatewayNodeAlreadyRegisteredError extends ConflictError<"GATEWAY_NODE_ALREADY_REGISTERED"> {
  constructor(
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_NODE_ALREADY_REGISTERED",
      message: `Node '${nodeId}' is already registered with the gateway`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new PermissionError({ code: "GATEWAY_AUTH_FAILED", ... })` */
export class GatewayAuthFailedError extends PermissionError<"GATEWAY_AUTH_FAILED"> {
  constructor(
    public readonly reason: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_AUTH_FAILED",
      message: `Gateway authentication failed: ${reason}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new NotFoundError({ code: "GATEWAY_SESSION_EXPIRED", ... })` */
export class GatewaySessionExpiredError extends NotFoundError<"GATEWAY_SESSION_EXPIRED"> {
  constructor(
    public readonly sessionId: string,
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_SESSION_EXPIRED",
      message: `Session '${sessionId}' for node '${nodeId}' has expired`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ConflictError({ code: "GATEWAY_SESSION_INVALID_TRANSITION", ... })` */
export class GatewaySessionInvalidTransitionError extends ConflictError<"GATEWAY_SESSION_INVALID_TRANSITION"> {
  constructor(
    public readonly currentState: string,
    public readonly event: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_SESSION_INVALID_TRANSITION",
      message: `Invalid session transition: cannot apply '${event}' in state '${currentState}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "GATEWAY_LANE_OVERFLOW", ... })` */
export class GatewayLaneOverflowError extends RateLimitError<"GATEWAY_LANE_OVERFLOW"> {
  constructor(
    public readonly lane: string,
    public readonly nodeId: string,
    public readonly capacity: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_LANE_OVERFLOW",
      message: `Lane '${lane}' for node '${nodeId}' overflow (capacity: ${capacity})`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "GATEWAY_CONFIG_INVALID", ... })` */
export class GatewayConfigInvalidError extends ValidationError<"GATEWAY_CONFIG_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_CONFIG_INVALID",
      message: `Invalid gateway configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "GATEWAY_CONFIG_RELOAD_FAILED", ... })` */
export class GatewayConfigReloadFailedError extends ExternalError<"GATEWAY_CONFIG_RELOAD_FAILED"> {
  constructor(
    public readonly configPath: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_CONFIG_RELOAD_FAILED",
      message: `Config reload failed for '${configPath}': ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "GATEWAY_HEARTBEAT_TIMEOUT", ... })` */
export class GatewayHeartbeatTimeoutError extends TimeoutError<"GATEWAY_HEARTBEAT_TIMEOUT"> {
  constructor(
    public readonly nodeId: string,
    public readonly intervalMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "GATEWAY_HEARTBEAT_TIMEOUT",
      message: `Node '${nodeId}' failed to respond to heartbeat within ${intervalMs}ms`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// AG-UI ERRORS
// ============================================================================

/** @deprecated Use `new ValidationError({ code: "AGUI_INVALID_INPUT", ... })` */
export class AguiInvalidInputError extends ValidationError<"AGUI_INVALID_INPUT"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_INVALID_INPUT",
      message: `Invalid AG-UI input: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "input", message: i, code: "INPUT_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "AGUI_STREAM_INTERRUPTED", ... })` */
export class AguiStreamInterruptedError extends ExternalError<"AGUI_STREAM_INTERRUPTED"> {
  constructor(
    public readonly runId: string,
    public readonly threadId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_STREAM_INTERRUPTED",
      message: `Stream interrupted for run '${runId}' on thread '${threadId}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "AGUI_ENCODING_FAILED", ... })` */
export class AguiEncodingFailedError extends ExternalError<"AGUI_ENCODING_FAILED"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_ENCODING_FAILED",
      message: `AG-UI encoding failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "AGUI_RUN_TIMEOUT", ... })` */
export class AguiRunTimeoutError extends TimeoutError<"AGUI_RUN_TIMEOUT"> {
  constructor(
    public readonly runId: string,
    public readonly maxDurationMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_RUN_TIMEOUT",
      message: `Run '${runId}' exceeded maximum duration of ${maxDurationMs}ms`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "AGUI_RUN_FAILED", ... })` */
export class AguiRunFailedError extends ExternalError<"AGUI_RUN_FAILED"> {
  constructor(
    public readonly runId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_RUN_FAILED",
      message: `Run '${runId}' failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "AGUI_CONNECTION_LIMIT_REACHED", ... })` */
export class AguiConnectionLimitReachedError extends RateLimitError<"AGUI_CONNECTION_LIMIT_REACHED"> {
  constructor(
    public readonly maxConnections: number,
    public readonly currentConnections: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "AGUI_CONNECTION_LIMIT_REACHED",
      message: `Connection limit reached: ${currentConnections}/${maxConnections} active connections`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// HOOK ERRORS
// ============================================================================

/** @deprecated Use `new ValidationError({ code: "HOOK_CONFIGURATION_INVALID", ... })` */
export class HookConfigurationError extends ValidationError<"HOOK_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "HOOK_CONFIGURATION_INVALID",
      message: `Invalid hook configuration: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "HOOK_EXECUTION_FAILED", ... })` */
export class HookExecutionError extends ExternalError<"HOOK_EXECUTION_FAILED"> {
  constructor(
    public readonly hookEvent: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "HOOK_EXECUTION_FAILED",
      message: `Hook '${hookEvent}' execution failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "HOOK_TIMEOUT", ... })` */
export class HookTimeoutError extends TimeoutError<"HOOK_TIMEOUT"> {
  constructor(
    public readonly hookEvent: string,
    public readonly timeoutMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "HOOK_TIMEOUT",
      message: `Hook '${hookEvent}' exceeded timeout of ${timeoutMs}ms`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "HOOK_REENTRANCY_EXCEEDED", ... })` */
export class HookReentrancyError extends ExternalError<"HOOK_REENTRANCY_EXCEEDED"> {
  constructor(
    public readonly hookEvent: string,
    public readonly depth: number,
    public readonly maxDepth: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "HOOK_REENTRANCY_EXCEEDED",
      message: `Hook '${hookEvent}' re-entrancy depth ${depth} exceeds maximum ${maxDepth}`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// MCP ERRORS
// ============================================================================

/** @deprecated Use `new ExternalError({ code: "MCP_CONNECTION_FAILED", ... })` */
export class McpConnectionFailedError extends ExternalError<"MCP_CONNECTION_FAILED"> {
  constructor(
    public readonly serverName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_CONNECTION_FAILED",
      message: `MCP server '${serverName}' connection failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MCP_INITIALIZATION_FAILED", ... })` */
export class McpInitializationFailedError extends ExternalError<"MCP_INITIALIZATION_FAILED"> {
  constructor(
    public readonly serverName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_INITIALIZATION_FAILED",
      message: `MCP server '${serverName}' initialization failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MCP_TOOL_CALL_FAILED", ... })` */
export class McpToolCallFailedError extends ExternalError<"MCP_TOOL_CALL_FAILED"> {
  constructor(
    public readonly toolName: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_TOOL_CALL_FAILED",
      message: `MCP tool '${toolName}' call failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new NotFoundError({ code: "MCP_TOOL_NOT_FOUND", ... })` */
export class McpToolNotFoundError extends NotFoundError<"MCP_TOOL_NOT_FOUND"> {
  constructor(
    public readonly toolName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_TOOL_NOT_FOUND",
      message: `MCP tool '${toolName}' not found on server`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new NotFoundError({ code: "MCP_RESOURCE_NOT_FOUND", ... })` */
export class McpResourceNotFoundError extends NotFoundError<"MCP_RESOURCE_NOT_FOUND"> {
  constructor(
    public readonly uri: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_RESOURCE_NOT_FOUND",
      message: `MCP resource '${uri}' not found`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MCP_RESOURCE_READ_FAILED", ... })` */
export class McpResourceReadFailedError extends ExternalError<"MCP_RESOURCE_READ_FAILED"> {
  constructor(
    public readonly uri: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_RESOURCE_READ_FAILED",
      message: `MCP resource '${uri}' read failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MCP_TRANSPORT_ERROR", ... })` */
export class McpTransportError extends ExternalError<"MCP_TRANSPORT_ERROR"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_TRANSPORT_ERROR",
      message: `MCP transport error: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "MCP_SERVER_DISCONNECTED", ... })` */
export class McpServerDisconnectedError extends ExternalError<"MCP_SERVER_DISCONNECTED"> {
  constructor(
    public readonly serverName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MCP_SERVER_DISCONNECTED",
      message: `MCP server '${serverName}' disconnected unexpectedly`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// NODE ERRORS
// ============================================================================

/** @deprecated Use `new ConflictError({ code: "NODE_START_ERROR", ... })` */
export class NodeStartError extends ConflictError<"NODE_START_ERROR"> {
  constructor(
    public readonly nodeId: string,
    public readonly currentState: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_START_ERROR",
      message: `Node '${nodeId}' cannot start: currently in state '${currentState}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "NODE_REGISTRATION_TIMEOUT", ... })` */
export class NodeRegistrationTimeoutError extends TimeoutError<"NODE_REGISTRATION_TIMEOUT"> {
  constructor(
    public readonly nodeId: string,
    public readonly timeoutMs: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_REGISTRATION_TIMEOUT",
      message: `Node '${nodeId}' registration timed out after ${timeoutMs}ms`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new PermissionError({ code: "NODE_AUTH_FAILURE", ... })` */
export class NodeAuthFailureError extends PermissionError<"NODE_AUTH_FAILURE"> {
  constructor(
    public readonly nodeId: string,
    public readonly closeCode: number,
    public readonly reason: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_AUTH_FAILURE",
      message: `Node '${nodeId}' authentication failure (code ${closeCode}): ${reason}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "NODE_RECONNECT_EXHAUSTED", ... })` */
export class NodeReconnectExhaustedError extends ExternalError<"NODE_RECONNECT_EXHAUSTED"> {
  constructor(
    public readonly nodeId: string,
    public readonly attempts: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_RECONNECT_EXHAUSTED",
      message: `Node '${nodeId}' reconnection failed after ${attempts} attempts`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "NODE_HANDLER_ERROR", ... })` */
export class NodeHandlerError extends ExternalError<"NODE_HANDLER_ERROR"> {
  constructor(
    public readonly context: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_HANDLER_ERROR",
      message: `Node handler error (${context}): ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new TimeoutError({ code: "NODE_CONNECTION_TIMEOUT", ... })` */
export class NodeConnectionTimeoutError extends TimeoutError<"NODE_CONNECTION_TIMEOUT"> {
  constructor(
    public readonly nodeId: string,
    public readonly timeoutMs: number,
    public readonly gatewayUrl: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_CONNECTION_TIMEOUT",
      message: `Node '${nodeId}' connection to '${gatewayUrl}' timed out after ${timeoutMs}ms`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new RateLimitError({ code: "NODE_FRAME_TOO_LARGE", ... })` */
export class NodeFrameTooLargeError extends RateLimitError<"NODE_FRAME_TOO_LARGE"> {
  constructor(
    public readonly sizeBytes: number,
    public readonly maxSizeBytes: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_FRAME_TOO_LARGE",
      message: `Frame size ${sizeBytes} bytes exceeds limit of ${maxSizeBytes} bytes`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "NODE_STOPPED", ... })` */
export class NodeStoppedError extends ExternalError<"NODE_STOPPED"> {
  constructor(
    public readonly nodeId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "NODE_STOPPED",
      message: `Node '${nodeId}' operation cancelled: node is stopping`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// SANITIZE ERRORS
// ============================================================================

/** @deprecated Use `new ValidationError({ code: "SANITIZE_CONFIGURATION_INVALID", ... })` */
export class SanitizeConfigurationError extends ValidationError<"SANITIZE_CONFIGURATION_INVALID"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly configIssues?: readonly string[] | undefined;

  constructor(
    message: string,
    issues?: readonly string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "SANITIZE_CONFIGURATION_INVALID",
      message,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues
        ? { issues: issues.map((i) => ({ field: "config", message: i, code: "CONFIG_ISSUE" })) }
        : {}),
    });
    this.configIssues = issues;
  }
}

/** @deprecated Use `new ExternalError({ code: "SANITIZE_RULE_FAILED", ... })` */
export class SanitizeRuleFailedError extends ExternalError<"SANITIZE_RULE_FAILED"> {
  constructor(
    public readonly ruleName: string,
    message: string,
    metadata?: Record<string, string>,
    traceId?: string,
    cause?: Error,
  ) {
    super({
      code: "SANITIZE_RULE_FAILED",
      message: `Rule '${ruleName}' failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "SANITIZE_CONTENT_BLOCKED", ... })` */
export class SanitizeContentBlockedError extends ValidationError<"SANITIZE_CONTENT_BLOCKED"> {
  constructor(
    public readonly reason: string,
    public readonly contentLength: number,
    public readonly maxLength: number,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "SANITIZE_CONTENT_BLOCKED",
      message: `Content blocked: ${reason} (length: ${contentLength}, max: ${maxLength})`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// MANIFEST ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "MANIFEST_FILE_NOT_FOUND", ... })` */
export class ManifestFileNotFoundError extends NotFoundError<"MANIFEST_FILE_NOT_FOUND"> {
  constructor(
    public readonly filePath: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MANIFEST_FILE_NOT_FOUND",
      message: `Manifest file not found: ${filePath}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "MANIFEST_PARSE_FAILED", ... })` */
export class ManifestParseError extends ValidationError<"MANIFEST_PARSE_FAILED"> {
  constructor(
    public readonly filePath: string | undefined,
    message: string,
    public readonly line?: number | undefined,
    public readonly column?: number | undefined,
    public override readonly cause?: Error | undefined,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    const location =
      line !== undefined ? ` at line ${line}${column !== undefined ? `:${column}` : ""}` : "";
    super({
      code: "MANIFEST_PARSE_FAILED",
      message: `Manifest parse failed${filePath ? ` (${filePath})` : ""}${location}: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "MANIFEST_VALIDATION_FAILED", ... })` */
export class ManifestSchemaError extends ValidationError<"MANIFEST_VALIDATION_FAILED"> {
  /** @deprecated Access `.issues` (ValidationIssue[]) instead */
  readonly schemaIssues: readonly string[];

  constructor(
    schemaIssues: readonly string[],
    cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MANIFEST_VALIDATION_FAILED",
      message: `Manifest validation failed:\n${schemaIssues.map((i) => `  - ${i}`).join("\n")}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(cause ? { cause } : {}),
      issues: schemaIssues.map((i) => ({ field: "manifest", message: i, code: "SCHEMA_ISSUE" })),
    });
    this.schemaIssues = schemaIssues;
  }
}

/** @deprecated Use `new ValidationError({ code: "MANIFEST_INTERPOLATION_FAILED", ... })` */
export class ManifestInterpolationError extends ValidationError<"MANIFEST_INTERPOLATION_FAILED"> {
  constructor(
    public readonly missingVars: readonly string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "MANIFEST_INTERPOLATION_FAILED",
      message: `Missing environment variable${missingVars.length > 1 ? "s" : ""}: ${missingVars.join(", ")}`,
      metadata,
      traceId,
    });
  }
}

// ============================================================================
// SKILL ERRORS (legacy wrappers)
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "SKILL_NOT_FOUND", ... })` */
export class SkillNotFoundError extends NotFoundError<"SKILL_NOT_FOUND"> {
  constructor(
    public readonly skillName: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "SKILL_NOT_FOUND",
      message: `Skill '${skillName}' not found`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "SKILL_PARSE_ERROR", ... })` */
export class SkillParseError extends ValidationError<"SKILL_PARSE_ERROR"> {
  constructor(
    public readonly filePath: string | undefined,
    message: string,
    public override readonly cause?: Error | undefined,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "SKILL_PARSE_ERROR",
      message: `Skill parse error${filePath ? ` (${filePath})` : ""}: ${message}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ValidationError({ code: "SKILL_VALIDATION_ERROR", ... })` */
export class SkillValidationError extends ValidationError<"SKILL_VALIDATION_ERROR"> {
  readonly validationIssues?: readonly string[] | undefined;
  constructor(
    public readonly skillName: string | undefined,
    issues: readonly string[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "SKILL_VALIDATION_ERROR",
      message: `Skill validation failed${skillName ? ` for '${skillName}'` : ""}:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
      ...(metadata ? { metadata } : {}),
      ...(traceId ? { traceId } : {}),
      ...(issues.length > 0
        ? { issues: issues.map((i) => ({ field: "skill", message: i, code: "VALIDATION" })) }
        : {}),
    });
    this.validationIssues = issues;
  }
}

// ============================================================================
// LSP ERRORS
// ============================================================================

/** @deprecated Use `new NotFoundError({ code: "LSP_SERVER_NOT_FOUND", ... })` */
export class LspServerNotFoundError extends NotFoundError<"LSP_SERVER_NOT_FOUND"> {
  constructor(
    public readonly languageId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "LSP_SERVER_NOT_FOUND",
      message: `No language server configured for '${languageId}'`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "LSP_INITIALIZATION_FAILED", ... })` */
export class LspInitializationFailedError extends ExternalError<"LSP_INITIALIZATION_FAILED"> {
  constructor(
    public readonly languageId: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "LSP_INITIALIZATION_FAILED",
      message: `LSP server '${languageId}' initialization failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "LSP_REQUEST_FAILED", ... })` */
export class LspRequestFailedError extends ExternalError<"LSP_REQUEST_FAILED"> {
  constructor(
    public readonly method: string,
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "LSP_REQUEST_FAILED",
      message: `LSP request '${method}' failed: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "LSP_SERVER_CRASHED", ... })` */
export class LspServerCrashedError extends ExternalError<"LSP_SERVER_CRASHED"> {
  constructor(
    public readonly languageId: string,
    public readonly exitCode: number | null,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "LSP_SERVER_CRASHED",
      message: `LSP server '${languageId}' crashed with exit code ${exitCode}`,
      metadata,
      traceId,
    });
  }
}

/** @deprecated Use `new ExternalError({ code: "LSP_TRANSPORT_ERROR", ... })` */
export class LspTransportError extends ExternalError<"LSP_TRANSPORT_ERROR"> {
  constructor(
    message: string,
    public override readonly cause?: Error,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    super({
      code: "LSP_TRANSPORT_ERROR",
      message: `LSP transport error: ${message}`,
      metadata,
      traceId,
      ...(cause ? { cause } : {}),
    });
  }
}
