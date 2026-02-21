/**
 * ExecApprovals resource for managing command allowlists, policies, and approvals
 */

import type {
  ApprovalResponse,
  ExecPolicyResponse,
  GetPolicyParams,
  ListAllowlistParams,
  ListAllowlistResponse,
  SubmitApprovalParams,
  UpsertAllowlistParams,
} from "../types/exec-approvals.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing exec-approval allowlists, policies, and async approvals
 */
export class ExecApprovalsResource extends BaseResource {
  /**
   * List allowlist entries for an agent
   */
  async listAllowlist(params: ListAllowlistParams): Promise<ListAllowlistResponse> {
    return this.http.request<ListAllowlistResponse>(`/exec-approvals/allowlist`, {
      method: "GET",
      query: { agent_id: params.agent_id },
    });
  }

  /**
   * Batch upsert allowlist entries for an agent
   */
  async batchUpsertAllowlist(params: UpsertAllowlistParams): Promise<{ upserted: number }> {
    return this.http.request<{ upserted: number }>(`/exec-approvals/allowlist`, {
      method: "POST",
      body: params,
    });
  }

  /**
   * Delete a single allowlist entry
   */
  async deleteAllowlistEntry(agentId: string, pattern: string): Promise<void> {
    return this.http.request<void>(`/exec-approvals/allowlist/${encodeURIComponent(pattern)}`, {
      method: "DELETE",
      query: { agent_id: agentId },
    });
  }

  /**
   * Get the exec-approval policy (agent-level or zone-level fallback)
   */
  async getPolicy(params?: GetPolicyParams): Promise<ExecPolicyResponse | null> {
    return this.http.request<ExecPolicyResponse | null>(`/exec-approvals/policy`, {
      method: "GET",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Submit a command for async approval
   */
  async submitApproval(params: SubmitApprovalParams): Promise<ApprovalResponse> {
    return this.http.request<ApprovalResponse>(`/exec-approvals/approvals`, {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get the status of an approval request
   */
  async getApproval(approvalId: string): Promise<ApprovalResponse> {
    return this.http.request<ApprovalResponse>(`/exec-approvals/approvals/${approvalId}`, {
      method: "GET",
    });
  }
}
