/**
 * Web search errors — Pluggable search provider interface (#119)
 *
 * Abstract base: WebSearchError
 * Concrete:
 *   - SearchProviderError        (SEARCH_PROVIDER_ERROR)
 *   - SearchRateLimitedError     (SEARCH_RATE_LIMITED)
 *   - SearchAllProvidersFailedError (SEARCH_ALL_PROVIDERS_FAILED)
 *   - SearchInvalidQueryError    (SEARCH_INVALID_QUERY)
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

export abstract class WebSearchError extends TemplarError {}

// ---------------------------------------------------------------------------
// Concrete Errors
// ---------------------------------------------------------------------------

export class SearchProviderError extends WebSearchError {
  readonly _tag = "ExternalError" as const;
  readonly code = "SEARCH_PROVIDER_ERROR" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly providerId: string;

  constructor(providerId: string, message: string, cause?: Error) {
    super(
      `Search provider "${providerId}" error: ${message}`,
      undefined,
      undefined,
      cause ? { cause } : undefined,
    );
    const entry = ERROR_CATALOG.SEARCH_PROVIDER_ERROR;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.providerId = providerId;
  }
}

export class SearchRateLimitedError extends WebSearchError {
  readonly _tag = "RateLimitError" as const;
  readonly code = "SEARCH_RATE_LIMITED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly providerId: string;

  constructor(providerId: string) {
    super(`Search provider "${providerId}" rate limited`);
    const entry = ERROR_CATALOG.SEARCH_RATE_LIMITED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.providerId = providerId;
  }
}

export class SearchAllProvidersFailedError extends WebSearchError {
  readonly _tag = "ExternalError" as const;
  readonly code = "SEARCH_ALL_PROVIDERS_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly failedProviders: readonly string[];

  constructor(failedProviders: readonly string[], lastError?: Error) {
    super(
      `All search providers failed: [${failedProviders.join(", ")}]${lastError ? `. Last error: ${lastError.message}` : ""}`,
      undefined,
      undefined,
      lastError ? { cause: lastError } : undefined,
    );
    const entry = ERROR_CATALOG.SEARCH_ALL_PROVIDERS_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.failedProviders = failedProviders;
  }
}

export class SearchInvalidQueryError extends WebSearchError {
  readonly _tag = "ValidationError" as const;
  readonly code = "SEARCH_INVALID_QUERY" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly query: string;

  constructor(query: string) {
    super(`Invalid search query: ${query ? `"${query}"` : "empty query"}`);
    const entry = ERROR_CATALOG.SEARCH_INVALID_QUERY;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.query = query;
  }
}
