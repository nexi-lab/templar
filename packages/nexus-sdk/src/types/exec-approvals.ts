/**
 * Types for exec-approvals resources
 */

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export interface AllowlistEntryResponse {
  pattern: string;
  approval_count: number;
  auto_promoted: boolean;
  last_approved_at: string;
  agent_id: string;
}

export interface UpsertAllowlistParams {
  agent_id: string;
  entries: readonly UpsertAllowlistEntry[];
}

export interface UpsertAllowlistEntry {
  pattern: string;
  approval_count: number;
  auto_promoted: boolean;
  last_approved_at: string;
}

export interface ListAllowlistParams {
  agent_id: string;
}

export interface ListAllowlistResponse {
  entries: AllowlistEntryResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface ExecPolicyResponse {
  policy_id: string;
  additional_safe_binaries: string[];
  removed_safe_binaries: string[];
  additional_never_allow: string[];
  auto_promote_threshold: number | null;
  max_patterns: number | null;
  dangerous_flag_overrides: DangerousFlagOverride[];
  updated_at: string;
}

export interface DangerousFlagOverride {
  binary: string;
  flags: string[];
  risk: string;
  reason: string;
  action: "add" | "remove";
}

export interface GetPolicyParams {
  agent_id?: string;
}

// ---------------------------------------------------------------------------
// Approval workflow
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface SubmitApprovalParams {
  agent_id: string;
  command: string;
  risk: string;
  reason: string;
  session_id: string;
}

export interface ApprovalResponse {
  approval_id: string;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
}
