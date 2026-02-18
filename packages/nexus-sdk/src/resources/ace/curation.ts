/**
 * Curation sub-resource for the ACE API
 */

import type {
  CurateBulkParams,
  CurateParams,
  CurationResult,
} from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for curating playbook strategies via the Nexus ACE API
 */
export class CurationResource extends BaseResource {
  /**
   * Curate strategies from reflections into a playbook
   */
  async curate(params: CurateParams): Promise<CurationResult> {
    return this.http.request<CurationResult>("/api/v2/curate", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Bulk curate from multiple trajectories
   */
  async curateBulk(params: CurateBulkParams): Promise<Record<string, unknown>> {
    return this.http.request<Record<string, unknown>>("/api/v2/curate/bulk", {
      method: "POST",
      body: params,
    });
  }
}
