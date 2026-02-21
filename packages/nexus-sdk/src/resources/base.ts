/**
 * Base resource class for all API resources
 */

import type { HttpClient } from "../http/index.js";

/**
 * Base class for all resource classes
 *
 * Provides shared HTTP client access and common functionality
 */
export abstract class BaseResource {
  /**
   * HTTP client for making API requests
   */
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Build a query parameter object from params, stripping undefined values.
   *
   * Returns undefined if no parameters are set (avoids empty query strings).
   *
   * @param params - Raw parameters object (undefined values are omitted)
   * @returns Query object for HttpClient, or undefined if empty
   */
  protected buildQuery(
    params?: Record<string, string | number | boolean | undefined>,
  ): Record<string, string | number | boolean> | undefined {
    if (!params) return undefined;
    const query: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        query[key] = value;
      }
    }
    return Object.keys(query).length > 0 ? query : undefined;
  }
}
