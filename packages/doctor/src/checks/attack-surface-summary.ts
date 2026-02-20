import { createFinding } from "../finding-factory.js";
import type { DoctorCheckResult, DoctorFinding } from "../types.js";

// ---------------------------------------------------------------------------
// Attack surface summary — post-processing aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregates findings from all checks to produce summary-level findings.
 * This is NOT a `DoctorCheck` — it runs as a post-processing step on results.
 */
export function generateAttackSurfaceSummary(
  results: readonly DoctorCheckResult[],
): readonly DoctorFinding[] {
  const findings: DoctorFinding[] = [];

  // Collect all findings from all checks
  const allFindings = results.flatMap((r) => r.findings);
  const criticalAndHigh = allFindings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
  );

  // AS-001: High attack surface (>5 critical/high findings)
  if (criticalAndHigh.length > 5) {
    findings.push(
      createFinding({
        id: "AS-001",
        checkName: "attack-surface-summary",
        severity: "HIGH",
        title: "High attack surface detected",
        description: `Found ${criticalAndHigh.length} critical/high findings across ${results.length} checks`,
        remediation: "Prioritize fixing CRITICAL findings, then HIGH findings",
        location: "aggregate",
        owaspRef: collectOwaspRefs(criticalAndHigh),
      }),
    );
  }

  // AS-002: Missing security controls (checks with no findings that should have some)
  const _checksWithNoFindings = results.filter(
    (r) => r.status === "passed" && r.findings.length === 0,
  );
  const skippedChecks = results.filter((r) => r.status === "skipped");

  if (skippedChecks.length > 0) {
    findings.push(
      createFinding({
        id: "AS-002",
        checkName: "attack-surface-summary",
        severity: "MEDIUM",
        title: "Security checks skipped",
        description: `${skippedChecks.length} security check(s) were skipped: ${skippedChecks.map((r) => r.checkName).join(", ")}`,
        remediation:
          "Enable skipped checks by providing required configuration (e.g., Nexus client)",
        location: "aggregate",
        owaspRef: ["ASI07"],
      }),
    );
  }

  // AS-003: Remediation priority list
  if (allFindings.length > 0) {
    const severityOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    const sorted = [...allFindings].sort(
      (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
    );
    const top5 = sorted.slice(0, 5);

    findings.push(
      createFinding({
        id: "AS-003",
        checkName: "attack-surface-summary",
        severity: "LOW",
        title: "Remediation priority list",
        description: `Top ${top5.length} findings to address: ${top5.map((f) => `[${f.severity}] ${f.title}`).join("; ")}`,
        remediation: "Address findings in priority order: CRITICAL → HIGH → MEDIUM → LOW",
        location: "aggregate",
        owaspRef: collectOwaspRefs(top5),
      }),
    );
  }

  return findings;
}

function collectOwaspRefs(
  findings: readonly DoctorFinding[],
): readonly (
  | "ASI01"
  | "ASI02"
  | "ASI03"
  | "ASI04"
  | "ASI05"
  | "ASI06"
  | "ASI07"
  | "ASI08"
  | "ASI09"
  | "ASI10"
)[] {
  const refs = new Set<
    | "ASI01"
    | "ASI02"
    | "ASI03"
    | "ASI04"
    | "ASI05"
    | "ASI06"
    | "ASI07"
    | "ASI08"
    | "ASI09"
    | "ASI10"
  >();
  for (const f of findings) {
    for (const ref of f.owaspRef) {
      refs.add(ref);
    }
  }
  return [...refs];
}
