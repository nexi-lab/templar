/**
 * Human delay errors — Typing simulation configuration (#88)
 *
 * Abstract base: HumanDelayError
 * Concrete:
 *   - HumanDelayConfigurationError (HUMAN_DELAY_CONFIGURATION_INVALID)
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

export abstract class HumanDelayError extends TemplarError {}

// ---------------------------------------------------------------------------
// Concrete Errors
// ---------------------------------------------------------------------------

export class HumanDelayConfigurationError extends HumanDelayError {
  readonly _tag = "ValidationError" as const;
  readonly code = "HUMAN_DELAY_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Human delay configuration invalid: ${message}`);
    const entry = ERROR_CATALOG.HUMAN_DELAY_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}
