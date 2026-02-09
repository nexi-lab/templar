/**
 * HTTP client with retry, timeout, and error handling
 */

import { NexusAPIError, NexusNetworkError, NexusTimeoutError } from "../errors.js";
import type { ClientConfig, ErrorResponse, RequestOptions, RetryOptions } from "../types/index.js";

/**
 * Default configuration values
 */
const DEFAULT_BASE_URL = "https://api.nexus.dev";
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * HTTP client for making requests to the Nexus API
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retryOptions: Required<RetryOptions>;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...config.retry,
    };

    this.defaultHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "@nexus/sdk",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.headers,
    };
  }

  /**
   * Create a new HttpClient with updated retry options
   */
  withRetry(options: RetryOptions): HttpClient {
    return new HttpClient({
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retry: { ...this.retryOptions, ...options },
      headers: this.defaultHeaders,
    });
  }

  /**
   * Create a new HttpClient with updated timeout
   */
  withTimeout(timeout: number): HttpClient {
    return new HttpClient({
      baseUrl: this.baseUrl,
      timeout,
      retry: this.retryOptions,
      headers: this.defaultHeaders,
    });
  }

  /**
   * Make an HTTP request with retry and timeout
   */
  async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers = { ...this.defaultHeaders, ...options.headers };

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryOptions.maxAttempts; attempt++) {
      try {
        const fetchOptions: RequestInit = {
          method: options.method,
          headers,
        };

        if (options.body) {
          fetchOptions.body = JSON.stringify(options.body);
        }

        const response = await this.fetchWithTimeout(url, fetchOptions);

        return await this.handleResponse<T>(response);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (
          error instanceof NexusAPIError &&
          !this.retryOptions.retryableStatusCodes.includes(error.statusCode)
        ) {
          throw error;
        }

        if (error instanceof NexusTimeoutError) {
          // Retry timeouts
        } else if (error instanceof NexusNetworkError) {
          // Retry network errors
        } else if (error instanceof NexusAPIError) {
          // Retry only retryable status codes
        } else {
          // Don't retry unknown errors
          throw error;
        }

        // If this was the last attempt, throw
        if (attempt === this.retryOptions.maxAttempts) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryOptions.initialDelay * this.retryOptions.backoffMultiplier ** (attempt - 1),
          this.retryOptions.maxDelay,
        );

        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError ?? new NexusNetworkError("Request failed after all retries");
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path, this.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new NexusTimeoutError(`Request timeout after ${this.timeout}ms`, this.timeout);
      }

      const message = `Network error: ${error instanceof Error ? error.message : String(error)}`;
      throw error instanceof Error
        ? new NexusNetworkError(message, { cause: error })
        : new NexusNetworkError(message);
    }
  }

  /**
   * Handle HTTP response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    // Handle successful responses
    if (response.ok) {
      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new NexusAPIError("Failed to parse response JSON", response.status, undefined, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    }

    // Handle error responses
    let errorResponse: ErrorResponse | undefined;
    try {
      errorResponse = (await response.json()) as ErrorResponse;
    } catch {
      // If we can't parse error response, continue without it
      errorResponse = undefined;
    }

    const message = errorResponse?.message ?? `HTTP ${response.status}: ${response.statusText}`;

    throw new NexusAPIError(message, response.status, errorResponse);
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
