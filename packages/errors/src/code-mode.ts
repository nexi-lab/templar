import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all code-mode errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for code-mode errors.
 *
 * Enables generic catch: `if (e instanceof CodeModeError)`
 * while specific subclasses allow precise handling.
 */
export abstract class CodeModeError extends TemplarError {}

// ---------------------------------------------------------------------------
// Code syntax error
// ---------------------------------------------------------------------------

/**
 * Thrown when LLM-generated Python code contains syntax errors.
 */
export class CodeSyntaxError extends CodeModeError {
  readonly _tag = "ValidationError" as const;
  readonly code = "CODE_SYNTAX_ERROR" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly generatedCode: string;
  readonly lineNumber: number;

  constructor(generatedCode: string, lineNumber: number, message: string) {
    super(`Code syntax error at line ${lineNumber}: ${message}`);
    const entry = ERROR_CATALOG.CODE_SYNTAX_ERROR;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.generatedCode = generatedCode;
    this.lineNumber = lineNumber;
  }
}

// ---------------------------------------------------------------------------
// Code runtime error
// ---------------------------------------------------------------------------

/**
 * Thrown when LLM-generated code raises an exception during execution.
 */
export class CodeRuntimeError extends CodeModeError {
  readonly _tag = "ExternalError" as const;
  readonly code = "CODE_RUNTIME_ERROR" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly generatedCode: string;
  readonly runtimeMessage: string;

  constructor(generatedCode: string, runtimeMessage: string) {
    super(`Code runtime error: ${runtimeMessage}`);
    const entry = ERROR_CATALOG.CODE_RUNTIME_ERROR;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.generatedCode = generatedCode;
    this.runtimeMessage = runtimeMessage;
  }
}

// ---------------------------------------------------------------------------
// Code execution timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when code execution exceeds the configured timeout.
 */
export class CodeExecutionTimeoutError extends CodeModeError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "CODE_EXECUTION_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly timeoutSeconds: number;

  constructor(timeoutSeconds: number) {
    super(`Code execution timed out after ${timeoutSeconds}s`);
    const entry = ERROR_CATALOG.CODE_EXECUTION_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.timeoutSeconds = timeoutSeconds;
  }
}

// ---------------------------------------------------------------------------
// Code resource exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when code execution exceeds resource limits.
 */
export class CodeResourceExceededError extends CodeModeError {
  readonly _tag = "ExternalError" as const;
  readonly code = "CODE_RESOURCE_EXCEEDED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly resource: "memory" | "allocations" | "recursion";

  constructor(resource: "memory" | "allocations" | "recursion") {
    super(`Code execution exceeded ${resource} limit`);
    const entry = ERROR_CATALOG.CODE_RESOURCE_EXCEEDED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.resource = resource;
  }
}

// ---------------------------------------------------------------------------
// Code sandbox not found
// ---------------------------------------------------------------------------

/**
 * Thrown when the sandbox session does not exist or has expired.
 */
export class CodeSandboxNotFoundError extends CodeModeError {
  readonly _tag = "NotFoundError" as const;
  readonly code = "CODE_SANDBOX_NOT_FOUND" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly sandboxId: string;

  constructor(sandboxId: string) {
    super(`Sandbox not found: ${sandboxId}`);
    const entry = ERROR_CATALOG.CODE_SANDBOX_NOT_FOUND;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.sandboxId = sandboxId;
  }
}
