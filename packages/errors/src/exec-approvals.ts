import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all exec-approval errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for exec-approval errors.
 *
 * Enables generic catch: `if (e instanceof ExecApprovalError)`
 * while specific subclasses allow precise handling.
 */
export abstract class ExecApprovalError extends TemplarError {}

// ---------------------------------------------------------------------------
// Command blocked — hit NEVER_ALLOW list
// ---------------------------------------------------------------------------

/**
 * Thrown when a command matches the NEVER_ALLOW hard block list.
 */
export class ExecApprovalCommandBlockedError extends ExecApprovalError {
  readonly _tag = "PermissionError" as const;
  readonly code = "EXEC_APPROVAL_COMMAND_BLOCKED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly command: string;
  readonly matchedPattern: string;

  constructor(command: string, matchedPattern: string) {
    super(`Command blocked: "${command}" matched NEVER_ALLOW pattern "${matchedPattern}"`);
    const entry = ERROR_CATALOG.EXEC_APPROVAL_COMMAND_BLOCKED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.command = command;
    this.matchedPattern = matchedPattern;
  }
}

// ---------------------------------------------------------------------------
// Command denied — human denied the command
// ---------------------------------------------------------------------------

/**
 * Thrown when a human operator denies a command execution.
 */
export class ExecApprovalDeniedError extends ExecApprovalError {
  readonly _tag = "PermissionError" as const;
  readonly code = "EXEC_APPROVAL_DENIED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly command: string;
  readonly agentId: string;
  readonly reason: string;

  constructor(command: string, agentId: string, reason: string) {
    super(`Command denied: "${command}" for agent ${agentId} — ${reason}`);
    const entry = ERROR_CATALOG.EXEC_APPROVAL_DENIED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.command = command;
    this.agentId = agentId;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Parse failed — shell parser failed
// ---------------------------------------------------------------------------

/**
 * Thrown when a shell command cannot be parsed or tokenized.
 */
export class ExecApprovalParseError extends ExecApprovalError {
  readonly _tag = "ValidationError" as const;
  readonly code = "EXEC_APPROVAL_PARSE_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly rawCommand: string;
  readonly parseError: string;

  constructor(rawCommand: string, parseError: string) {
    super(`Command parse failed: ${parseError}`);
    const entry = ERROR_CATALOG.EXEC_APPROVAL_PARSE_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.rawCommand = rawCommand;
    this.parseError = parseError;
  }
}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the exec-approvals middleware configuration is invalid.
 */
export class ExecApprovalConfigurationError extends ExecApprovalError {
  readonly _tag = "ValidationError" as const;
  readonly code = "EXEC_APPROVAL_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Invalid exec-approval configuration: ${message}`);
    const entry = ERROR_CATALOG.EXEC_APPROVAL_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
