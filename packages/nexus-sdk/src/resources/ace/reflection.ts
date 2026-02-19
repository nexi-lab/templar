/**
 * Reflection sub-resource for the ACE API
 */

import type { ReflectionResult, ReflectParams } from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for triggering LLM-based trajectory reflection via the Nexus ACE API
 */
export class ReflectionResource extends BaseResource {
  /**
   * Reflect on a completed trajectory
   */
  async reflect(params: ReflectParams): Promise<ReflectionResult> {
    return this.http.request<ReflectionResult>("/api/v2/reflect", {
      method: "POST",
      body: params,
    });
  }
}
