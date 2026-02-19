/**
 * Playbooks sub-resource for the ACE API
 */

import type {
  CreatePlaybookParams,
  CreatePlaybookResponse,
  PlaybookEntry,
  PlaybookUsageParams,
  QueryPlaybooksParams,
  QueryPlaybooksResponse,
  UpdatePlaybookParams,
} from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for managing playbooks via the Nexus ACE API
 */
export class PlaybooksResource extends BaseResource {
  /**
   * Create a new playbook
   */
  async create(params: CreatePlaybookParams): Promise<CreatePlaybookResponse> {
    return this.http.request<CreatePlaybookResponse>("/api/v2/playbooks", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get a playbook by ID
   */
  async get(playbookId: string): Promise<PlaybookEntry> {
    const result = await this.http.request<{ playbook: PlaybookEntry }>(
      `/api/v2/playbooks/${playbookId}`,
      { method: "GET" },
    );
    return result.playbook;
  }

  /**
   * Update a playbook
   */
  async update(playbookId: string, params: UpdatePlaybookParams): Promise<Record<string, unknown>> {
    return this.http.request<Record<string, unknown>>(`/api/v2/playbooks/${playbookId}`, {
      method: "PUT",
      body: params,
    });
  }

  /**
   * Delete a playbook
   */
  async delete(playbookId: string): Promise<Record<string, unknown>> {
    return this.http.request<Record<string, unknown>>(`/api/v2/playbooks/${playbookId}`, {
      method: "DELETE",
    });
  }

  /**
   * Record playbook usage (success/failure tracking)
   */
  async recordUsage(params: PlaybookUsageParams): Promise<Record<string, unknown>> {
    const { playbook_id, ...body } = params;
    return this.http.request<Record<string, unknown>>(`/api/v2/playbooks/${playbook_id}/usage`, {
      method: "POST",
      body,
    });
  }

  /**
   * Query playbooks with filters
   */
  async query(params: QueryPlaybooksParams): Promise<QueryPlaybooksResponse> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params.scope !== undefined) query.scope = params.scope;
    if (params.name_pattern !== undefined) query.name_pattern = params.name_pattern;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;

    return this.http.request<QueryPlaybooksResponse>("/api/v2/playbooks", {
      method: "GET",
      query,
    });
  }
}
