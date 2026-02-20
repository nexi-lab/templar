import type { DoctorCheckResult, DoctorFinding, OwaspAgenticRef, Severity } from "./types.js";

// ---------------------------------------------------------------------------
// Finding factory
// ---------------------------------------------------------------------------

interface CreateFindingParams {
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

/**
 * Creates an immutable `DoctorFinding` from the given parameters.
 * Uses spread for optional `metadata` to comply with `exactOptionalPropertyTypes`.
 */
export function createFinding(params: CreateFindingParams): DoctorFinding {
  return {
    id: params.id,
    checkName: params.checkName,
    severity: params.severity,
    title: params.title,
    description: params.description,
    remediation: params.remediation,
    location: params.location,
    owaspRef: params.owaspRef,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };
}

// ---------------------------------------------------------------------------
// Check result factories
// ---------------------------------------------------------------------------

/**
 * Creates a check result with findings (or passed if no findings).
 */
export function createCheckResult(
  checkName: string,
  findings: readonly DoctorFinding[],
  durationMs: number,
): DoctorCheckResult {
  return {
    checkName,
    status: findings.length > 0 ? "findings" : "passed",
    durationMs,
    findings,
  };
}

/**
 * Creates a skipped check result.
 */
export function createSkippedResult(checkName: string, reason: string): DoctorCheckResult {
  return {
    checkName,
    status: "skipped",
    durationMs: 0,
    findings: [],
    skipReason: reason,
  };
}

/**
 * Creates an error check result from a failed check execution.
 */
export function createErrorResult(
  checkName: string,
  error: Error,
  durationMs: number,
): DoctorCheckResult {
  return {
    checkName,
    status: "error",
    durationMs,
    findings: [],
    error,
  };
}
