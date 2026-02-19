/**
 * Delegation errors — Task delegation lifecycle (#141)
 *
 * Abstract base: DelegationError
 * Concrete:
 *   - DelegationNodeUnavailableError  (GATEWAY_DELEGATION_NODE_UNAVAILABLE)
 *   - DelegationTimeoutError          (GATEWAY_DELEGATION_TIMEOUT)
 *   - DelegationExhaustedError        (GATEWAY_DELEGATION_EXHAUSTED)
 *   - DelegationInvalidError          (GATEWAY_DELEGATION_INVALID)
 *
 * GATEWAY_DELEGATION_REFUSED and GATEWAY_DELEGATION_NOT_FOUND use
 * PermissionError / NotFoundError directly with the typed code.
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

export abstract class DelegationError extends TemplarError {}

// ---------------------------------------------------------------------------
// Concrete Errors
// ---------------------------------------------------------------------------

export class DelegationNodeUnavailableError extends DelegationError {
  readonly _tag = "ExternalError" as const;
  readonly code = "GATEWAY_DELEGATION_NODE_UNAVAILABLE" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly nodeId: string;
  readonly circuitOpen: boolean;

  constructor(nodeId: string, circuitOpen: boolean) {
    super(
      circuitOpen
        ? `Delegation target node "${nodeId}" unavailable: circuit breaker open`
        : `Delegation target node "${nodeId}" unavailable`,
    );
    const entry = ERROR_CATALOG.GATEWAY_DELEGATION_NODE_UNAVAILABLE;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.nodeId = nodeId;
    this.circuitOpen = circuitOpen;
  }
}

export class DelegationTimeoutError extends DelegationError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "GATEWAY_DELEGATION_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly delegationId: string;
  readonly elapsedMs: number;
  readonly timeoutMs: number;

  constructor(delegationId: string, elapsedMs: number, timeoutMs: number) {
    super(`Delegation "${delegationId}" timed out after ${elapsedMs}ms (limit: ${timeoutMs}ms)`);
    const entry = ERROR_CATALOG.GATEWAY_DELEGATION_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.delegationId = delegationId;
    this.elapsedMs = elapsedMs;
    this.timeoutMs = timeoutMs;
  }
}

export class DelegationExhaustedError extends DelegationError {
  readonly _tag = "ExternalError" as const;
  readonly code = "GATEWAY_DELEGATION_EXHAUSTED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly delegationId: string;
  readonly failedNodes: readonly string[];

  constructor(delegationId: string, failedNodes: readonly string[]) {
    super(`Delegation "${delegationId}" exhausted all nodes: [${failedNodes.join(", ")}]`);
    const entry = ERROR_CATALOG.GATEWAY_DELEGATION_EXHAUSTED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.delegationId = delegationId;
    this.failedNodes = failedNodes;
  }
}

export class DelegationInvalidError extends DelegationError {
  readonly _tag = "ValidationError" as const;
  readonly code = "GATEWAY_DELEGATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly delegationId: string;
  readonly reason: string;

  constructor(delegationId: string, reason: string) {
    super(`Delegation "${delegationId}" invalid: ${reason}`);
    const entry = ERROR_CATALOG.GATEWAY_DELEGATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.delegationId = delegationId;
    this.reason = reason;
  }
}
