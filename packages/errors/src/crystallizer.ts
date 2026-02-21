import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all Crystallizer errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for Crystallizer errors.
 *
 * Enables generic catch: `if (e instanceof CrystallizerError)`
 * while specific subclasses allow precise handling.
 */
export abstract class CrystallizerError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when the crystallizer middleware configuration is invalid.
 */
export class CrystallizerConfigurationError extends CrystallizerError {
  readonly _tag = "CrystallizerError" as const;
  readonly code = "CRYSTALLIZER_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Invalid crystallizer configuration: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.CRYSTALLIZER_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}

// ---------------------------------------------------------------------------
// Mining failed
// ---------------------------------------------------------------------------

/**
 * Thrown when PrefixSpan pattern mining fails.
 */
export class CrystallizerMiningError extends CrystallizerError {
  readonly _tag = "CrystallizerError" as const;
  readonly code = "CRYSTALLIZER_MINING_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Pattern mining failed: ${message}`);
    const entry = ERROR_CATALOG.CRYSTALLIZER_MINING_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Persist failed
// ---------------------------------------------------------------------------

/**
 * Thrown when persisting a crystallized artifact to Nexus fails.
 */
export class CrystallizerPersistError extends CrystallizerError {
  readonly _tag = "CrystallizerError" as const;
  readonly code = "CRYSTALLIZER_PERSIST_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Crystallization persist failed: ${message}`);
    const entry = ERROR_CATALOG.CRYSTALLIZER_PERSIST_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
