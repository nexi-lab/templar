/**
 * SDK-specific error classes extending @templar/errors
 */

import { ERROR_CATALOG, type ErrorCode, type ErrorDomain, type GrpcStatusCode, type HttpStatusCode, TemplarError } from "@templar/errors";
import type { ErrorResponse } from "./types/index.js";

/**
 * Error for API-level failures (4xx, 5xx responses)
 */
export class NexusAPIError extends TemplarError {
  readonly _tag = "NexusAPIError" as const;
  readonly code: ErrorCode = "INTERNAL_ERROR" as const;
  readonly httpStatus: HttpStatusCode = ERROR_CATALOG.INTERNAL_ERROR.httpStatus;
  readonly grpcCode: GrpcStatusCode = ERROR_CATALOG.INTERNAL_ERROR.grpcCode;
  readonly domain: ErrorDomain = ERROR_CATALOG.INTERNAL_ERROR.domain;

  /**
   * HTTP status code from the API response
   */
  public readonly statusCode: number;

  /**
   * Error response from the API
   */
  public readonly response?: ErrorResponse;

  constructor(
    message: string,
    statusCode: number,
    response: ErrorResponse | undefined,
    options?: ErrorOptions,
  ) {
    super(message, undefined, undefined, options);
    this.statusCode = statusCode;
    if (response !== undefined) {
      this.response = response;
    }
  }
}

/**
 * Error for request timeouts
 */
export class NexusTimeoutError extends TemplarError {
  readonly _tag = "NexusTimeoutError" as const;
  readonly code: ErrorCode = "INTERNAL_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode = ERROR_CATALOG.INTERNAL_TIMEOUT.httpStatus;
  readonly grpcCode: GrpcStatusCode = ERROR_CATALOG.INTERNAL_TIMEOUT.grpcCode;
  readonly domain: ErrorDomain = ERROR_CATALOG.INTERNAL_TIMEOUT.domain;

  /**
   * Timeout duration in milliseconds
   */
  public readonly timeout: number;

  constructor(message: string, timeout: number, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
    this.timeout = timeout;
  }
}

/**
 * Error for network-level failures (connection refused, DNS, etc.)
 */
export class NexusNetworkError extends TemplarError {
  readonly _tag = "NexusNetworkError" as const;
  readonly code: ErrorCode = "INTERNAL_UNAVAILABLE" as const;
  readonly httpStatus: HttpStatusCode = ERROR_CATALOG.INTERNAL_UNAVAILABLE.httpStatus;
  readonly grpcCode: GrpcStatusCode = ERROR_CATALOG.INTERNAL_UNAVAILABLE.grpcCode;
  readonly domain: ErrorDomain = ERROR_CATALOG.INTERNAL_UNAVAILABLE.domain;

  constructor(message: string, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
  }
}

/**
 * Error for client-side validation failures
 */
export class NexusValidationError extends TemplarError {
  readonly _tag = "NexusValidationError" as const;
  readonly code: ErrorCode = "VALIDATION_FAILED" as const;
  readonly httpStatus: HttpStatusCode = ERROR_CATALOG.VALIDATION_FAILED.httpStatus;
  readonly grpcCode: GrpcStatusCode = ERROR_CATALOG.VALIDATION_FAILED.grpcCode;
  readonly domain: ErrorDomain = ERROR_CATALOG.VALIDATION_FAILED.domain;

  /**
   * Field that failed validation
   */
  public readonly field?: string;

  constructor(message: string, field: string | undefined, options?: ErrorOptions) {
    super(message, undefined, undefined, options);
    if (field !== undefined) {
      this.field = field;
    }
  }
}
