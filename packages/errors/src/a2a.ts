/**
 * A2A errors — Agent-to-Agent protocol client (#126)
 *
 * Abstract base: A2aError
 * Concrete:
 *   - A2aDiscoveryFailedError      (A2A_DISCOVERY_FAILED)
 *   - A2aAuthFailedError           (A2A_AUTH_FAILED)
 *   - A2aTaskRejectedError         (A2A_TASK_REJECTED)
 *   - A2aTaskFailedError           (A2A_TASK_FAILED)
 *   - A2aTaskTimeoutError          (A2A_TASK_TIMEOUT)
 *   - A2aUnsupportedOperationError (A2A_UNSUPPORTED_OPERATION)
 */

import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Abstract Base
// ---------------------------------------------------------------------------

export abstract class A2aError extends TemplarError {}

// ---------------------------------------------------------------------------
// Concrete Errors
// ---------------------------------------------------------------------------

export class A2aDiscoveryFailedError extends A2aError {
  readonly _tag = "ExternalError" as const;
  readonly code = "A2A_DISCOVERY_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly agentUrl: string;

  constructor(agentUrl: string, message: string, cause?: Error) {
    super(
      `A2A discovery failed for "${agentUrl}": ${message}`,
      undefined,
      undefined,
      cause ? { cause } : undefined,
    );
    const entry = ERROR_CATALOG.A2A_DISCOVERY_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.agentUrl = agentUrl;
  }
}

export class A2aAuthFailedError extends A2aError {
  readonly _tag = "PermissionError" as const;
  readonly code = "A2A_AUTH_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly agentUrl: string;

  constructor(agentUrl: string, message?: string) {
    super(`A2A authentication failed for "${agentUrl}"${message ? `: ${message}` : ""}`);
    const entry = ERROR_CATALOG.A2A_AUTH_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.agentUrl = agentUrl;
  }
}

export class A2aTaskRejectedError extends A2aError {
  readonly _tag = "ValidationError" as const;
  readonly code = "A2A_TASK_REJECTED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly taskId: string | undefined;
  readonly reason: string | undefined;

  constructor(taskId: string | undefined, reason?: string) {
    super(`A2A task rejected${taskId ? ` (task: ${taskId})` : ""}${reason ? `: ${reason}` : ""}`);
    const entry = ERROR_CATALOG.A2A_TASK_REJECTED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.taskId = taskId;
    this.reason = reason;
  }
}

export class A2aTaskFailedError extends A2aError {
  readonly _tag = "ExternalError" as const;
  readonly code = "A2A_TASK_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly taskId: string;

  constructor(taskId: string, message?: string, cause?: Error) {
    super(
      `A2A task failed (task: ${taskId})${message ? `: ${message}` : ""}`,
      undefined,
      undefined,
      cause ? { cause } : undefined,
    );
    const entry = ERROR_CATALOG.A2A_TASK_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.taskId = taskId;
  }
}

export class A2aTaskTimeoutError extends A2aError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "A2A_TASK_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly taskId: string;
  readonly timeoutMs: number;

  constructor(taskId: string, timeoutMs: number) {
    super(`A2A task timed out after ${timeoutMs}ms (task: ${taskId})`);
    const entry = ERROR_CATALOG.A2A_TASK_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.taskId = taskId;
    this.timeoutMs = timeoutMs;
  }
}

export class A2aUnsupportedOperationError extends A2aError {
  readonly _tag = "ValidationError" as const;
  readonly code = "A2A_UNSUPPORTED_OPERATION" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly operation: string;
  readonly agentUrl: string;

  constructor(agentUrl: string, operation: string) {
    super(`A2A agent "${agentUrl}" does not support operation: ${operation}`);
    const entry = ERROR_CATALOG.A2A_UNSUPPORTED_OPERATION;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.operation = operation;
    this.agentUrl = agentUrl;
  }
}
