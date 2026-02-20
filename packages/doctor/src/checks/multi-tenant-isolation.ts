import { createCheckResult, createErrorResult, createFinding } from "../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorFinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Multi-tenant isolation check
// ---------------------------------------------------------------------------

/**
 * Scans Nexus ReBAC grants for multi-tenant isolation issues:
 * cross-zone grants, wildcard permissions, and zone boundary violations.
 */
export class MultiTenantIsolationCheck implements DoctorCheck {
  readonly name = "multi-tenant-isolation";
  readonly requiresNexus = true;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();

    if (!context.nexus) {
      return createCheckResult(this.name, [], Math.round(performance.now() - start));
    }

    const findings: DoctorFinding[] = [];

    try {
      // Access the permissions resource via the Nexus client
      const nexus = context.nexus as unknown as Record<string, unknown>;
      const permissions = nexus.permissions as
        | { listNamespaceTools?: (ns: string) => Promise<unknown[]> }
        | undefined;

      if (!permissions?.listNamespaceTools) {
        const durationMs = Math.round(performance.now() - start);
        return createCheckResult(this.name, findings, durationMs);
      }

      const grants = await permissions.listNamespaceTools("*");

      if (Array.isArray(grants)) {
        for (const grant of grants) {
          if (!grant || typeof grant !== "object") continue;
          const g = grant as Record<string, unknown>;

          // MT-001: Cross-zone grant
          const sourceZone = g.sourceZone ?? g.source_zone;
          const targetZone = g.targetZone ?? g.target_zone;
          if (
            typeof sourceZone === "string" &&
            typeof targetZone === "string" &&
            sourceZone !== targetZone
          ) {
            findings.push(
              createFinding({
                id: "MT-001",
                checkName: this.name,
                severity: "CRITICAL",
                title: "Cross-zone permission grant",
                description: `Grant spans zones: ${sourceZone} → ${targetZone}`,
                remediation: "Remove cross-zone grants or add explicit zone bridging policies",
                location: `nexus:permissions:${String(g.id ?? "unknown")}`,
                owaspRef: ["ASI03", "ASI07"],
              }),
            );
          }

          // MT-002: Wildcard permission
          const permission = g.permission ?? g.action;
          const resource = g.resource ?? g.tool;
          if (
            (typeof permission === "string" && permission === "*") ||
            (typeof resource === "string" && resource === "*")
          ) {
            findings.push(
              createFinding({
                id: "MT-002",
                checkName: this.name,
                severity: "HIGH",
                title: "Wildcard permission grant",
                description: `Wildcard grant detected: permission=${String(permission)}, resource=${String(resource)}`,
                remediation: "Replace wildcard grants with specific permissions",
                location: `nexus:permissions:${String(g.id ?? "unknown")}`,
                owaspRef: ["ASI03", "ASI07"],
              }),
            );
          }

          // MT-003: Zone boundary (no zone specified)
          if (!sourceZone && !targetZone && !g.zone && !g.namespace) {
            findings.push(
              createFinding({
                id: "MT-003",
                checkName: this.name,
                severity: "MEDIUM",
                title: "Missing zone boundary",
                description: "Permission grant has no zone or namespace boundary",
                remediation: "Add explicit zone boundaries to all permission grants",
                location: `nexus:permissions:${String(g.id ?? "unknown")}`,
                owaspRef: ["ASI07"],
              }),
            );
          }
        }
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err : new Error(String(err));
      return createErrorResult(this.name, error, durationMs);
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }
}
