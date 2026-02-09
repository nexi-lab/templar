/**
 * SDK-specific error classes extending @templar/errors
 */

import { TemplarError } from "@templar/errors";
import type { ErrorResponse } from "./types/index.js";

/**
 * Base error class for all Nexus SDK errors
 */
export class NexusSDKError extends TemplarError {}

/**
 * Error for API-level failures (4xx, 5xx responses)
 */
export class NexusAPIError extends NexusSDKError {
  /**
   * HTTP status code
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
    super(message, options);
    this.statusCode = statusCode;
    if (response !== undefined) {
      this.response = response;
    }
  }
}

/**
 * Error for request timeouts
 */
export class NexusTimeoutError extends NexusSDKError {
  /**
   * Timeout duration in milliseconds
   */
  public readonly timeout: number;

  constructor(message: string, timeout: number, options?: ErrorOptions) {
    super(message, options);
    this.timeout = timeout;
  }
}

/**
 * Error for network-level failures (connection refused, DNS, etc.)
 */
export class NexusNetworkError extends NexusSDKError {}

/**
 * Error for client-side validation failures
 */
export class NexusValidationError extends NexusSDKError {
  /**
   * Field that failed validation
   */
  public readonly field?: string;

  constructor(message: string, field: string | undefined, options?: ErrorOptions) {
    super(message, options);
    if (field !== undefined) {
      this.field = field;
    }
  }
}
