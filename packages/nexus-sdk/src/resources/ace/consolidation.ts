/**
 * Consolidation sub-resource for the ACE API
 */

import type { ConsolidateParams, ConsolidationResult } from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for memory consolidation via the Nexus ACE API
 */
export class ConsolidationResource extends BaseResource {
  /**
   * Consolidate memories using affinity-based clustering
   */
  async consolidate(params: ConsolidateParams): Promise<ConsolidationResult> {
    return this.http.request<ConsolidationResult>("/api/v2/consolidate", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Build hierarchical memory structure
   */
  async buildHierarchy(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.request<Record<string, unknown>>("/api/v2/consolidate/hierarchy", {
      method: "POST",
      body: params,
    });
  }
}
