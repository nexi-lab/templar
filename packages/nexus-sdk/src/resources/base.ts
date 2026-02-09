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
}
