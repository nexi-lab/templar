import type { NexusClient } from "@templar/core";

// ---------------------------------------------------------------------------
// Severity and OWASP Agentic references
// ---------------------------------------------------------------------------

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/**
 * OWASP Agentic Security Initiative Top 10 reference identifiers.
 * @see https://owasp.org/www-project-agentic-security-initiative/
 */
export type OwaspAgenticRef =
  | "ASI01"
  | "ASI02"
  | "ASI03"
  | "ASI04"
  | "ASI05"
  | "ASI06"
  | "ASI07"
  | "ASI08"
  | "ASI09"
  | "ASI10";

// ---------------------------------------------------------------------------
// Finding — a single security issue discovered by a check
// ---------------------------------------------------------------------------

export interface DoctorFinding {
  readonly id: string;
  readonly checkName: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly remediation: string;
  readonly location: string;
  readonly owaspRef: readonly OwaspAgenticRef[];
  readonly metadata?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Check result — outcome of running a single check
// ---------------------------------------------------------------------------

export interface DoctorCheckResult {
  readonly checkName: string;
  readonly status: "passed" | "findings" | "skipped" | "error";
  readonly durationMs: number;
  readonly findings: readonly DoctorFinding[];
  readonly error?: Error;
  readonly skipReason?: string;
}

// ---------------------------------------------------------------------------
// Check context — runtime context passed to each check
// ---------------------------------------------------------------------------

export interface DoctorCheckContext {
  readonly workspace: string;
  readonly nexus?: NexusClient;
  readonly abortSignal?: AbortSignal;
  readonly verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Check interface — pluggable security check
// ---------------------------------------------------------------------------

export interface DoctorCheck {
  readonly name: string;
  readonly requiresNexus: boolean;
  run(context: DoctorCheckContext): Promise<DoctorCheckResult>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DoctorConfig {
  readonly workspace: string;
  readonly nexus?: NexusClient;
  readonly checks?: readonly DoctorCheck[];
  readonly disabledChecks?: readonly string[];
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly verbose?: boolean;
  readonly includeGlobs?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

// ---------------------------------------------------------------------------
// Report — final audit output
// ---------------------------------------------------------------------------

export interface DoctorReport {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly checkResults: readonly DoctorCheckResult[];
  readonly summary: DoctorSummary;
  readonly exitCode: number;
}

export interface DoctorSummary {
  readonly total: number;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly checksRun: number;
  readonly checksSkipped: number;
  readonly checksFailed: number;
}
