/**
 * Pairing errors — Code-based DM channel access control (#89)
 *
 * Abstract base: PairingError
 * Concrete:
 *   - PairingCodeExpiredError     (PAIRING_CODE_EXPIRED)
 *   - PairingCodeInvalidError     (PAIRING_CODE_INVALID)
 *   - PairingRateLimitedError     (PAIRING_RATE_LIMITED)
 *   - PairingConfigurationError   (PAIRING_CONFIGURATION_INVALID)
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

export abstract class PairingError extends TemplarError {}

// ---------------------------------------------------------------------------
// Concrete Errors
// ---------------------------------------------------------------------------

export class PairingCodeExpiredError extends PairingError {
  readonly _tag = "ValidationError" as const;
  readonly code = "PAIRING_CODE_EXPIRED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string = "The pairing code has expired") {
    super(`Pairing code expired: ${message}`);
    const entry = ERROR_CATALOG.PAIRING_CODE_EXPIRED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

export class PairingCodeInvalidError extends PairingError {
  readonly _tag = "PermissionError" as const;
  readonly code = "PAIRING_CODE_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string = "The provided pairing code is invalid") {
    super(`Pairing code invalid: ${message}`);
    const entry = ERROR_CATALOG.PAIRING_CODE_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

export class PairingRateLimitedError extends PairingError {
  readonly _tag = "RateLimitError" as const;
  readonly code = "PAIRING_RATE_LIMITED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string = "Too many pairing attempts") {
    super(`Pairing rate limited: ${message}`);
    const entry = ERROR_CATALOG.PAIRING_RATE_LIMITED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

export class PairingConfigurationError extends PairingError {
  readonly _tag = "ValidationError" as const;
  readonly code = "PAIRING_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Pairing configuration invalid: ${message}`);
    const entry = ERROR_CATALOG.PAIRING_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
