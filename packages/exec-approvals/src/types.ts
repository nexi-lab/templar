/**
 * Core type definitions for @templar/exec-approvals
 */

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Analysis result — the core output
// ---------------------------------------------------------------------------

export type AnalysisAction = "allow" | "ask" | "deny";

export type MatchedRule =
  | "safe-binary"
  | "allowlist"
  | "never-allow"
  | "dangerous-pattern"
  | "unknown";

export interface AnalysisResult {
  readonly action: AnalysisAction;
  readonly risk: RiskLevel;
  readonly reason: string;
  readonly command: ParsedCommand;
  readonly matchedPattern?: string;
  readonly matchedRule?: MatchedRule;
}

// ---------------------------------------------------------------------------
// Parsed command representation
// ---------------------------------------------------------------------------

export interface ParsedCommand {
  readonly binary: string;
  readonly subcommand?: string;
  readonly args: readonly string[];
  readonly flags: readonly string[];
  readonly hasRedirects: boolean;
  readonly hasPipes: boolean;
  readonly hasSubshell: boolean;
  readonly hasChaining: boolean;
  readonly rawCommand: string;
}

// ---------------------------------------------------------------------------
// Command pattern for allowlist
// ---------------------------------------------------------------------------

export type CommandPattern = string;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ExecApprovalsConfig {
  readonly safeBinaries?: readonly string[];
  readonly removeSafeBinaries?: readonly string[];
  readonly autoPromoteThreshold?: number;
  readonly maxPatterns?: number;
  readonly sensitiveEnvPatterns?: readonly string[];
  readonly onApprovalRequest?: (result: AnalysisResult) => Promise<"allow" | "deny">;
  readonly agentId?: string;
  readonly toolNames?: readonly string[];
}

export interface ResolvedExecApprovalsConfig {
  readonly safeBinaries: ReadonlySet<string>;
  readonly autoPromoteThreshold: number;
  readonly maxPatterns: number;
  readonly sensitiveEnvPatterns: readonly string[];
  readonly onApprovalRequest?: (result: AnalysisResult) => Promise<"allow" | "deny">;
  readonly agentId: string;
  readonly toolNames: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Allowlist entry
// ---------------------------------------------------------------------------

export interface AllowlistEntry {
  readonly pattern: CommandPattern;
  readonly approvalCount: number;
  readonly autoPromoted: boolean;
  readonly lastApprovedAt: number;
}

// ---------------------------------------------------------------------------
// Sanitized env result
// ---------------------------------------------------------------------------

export interface SanitizedEnv {
  readonly env: Readonly<Record<string, string>>;
  readonly strippedKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// Dangerous flag pattern
// ---------------------------------------------------------------------------

export interface DangerousFlagPattern {
  readonly binary: string;
  readonly flags: readonly string[];
  readonly risk: RiskLevel;
  readonly reason: string;
}
