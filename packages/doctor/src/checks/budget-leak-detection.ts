import { createCheckResult, createErrorResult, createFinding } from "../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorFinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Budget leak detection check
// ---------------------------------------------------------------------------

/**
 * Scans Nexus budget state for potential cost leaks:
 * zero balance, missing budget limits, and zone budget exceedance.
 */
export class BudgetLeakDetectionCheck implements DoctorCheck {
  readonly name = "budget-leak-detection";
  readonly requiresNexus = true;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();

    if (!context.nexus) {
      return createCheckResult(this.name, [], Math.round(performance.now() - start));
    }

    const findings: DoctorFinding[] = [];

    try {
      const nexus = context.nexus as unknown as Record<string, unknown>;
      const pay = nexus.pay as { getBalance?: () => Promise<unknown> } | undefined;

      if (!pay?.getBalance) {
        const durationMs = Math.round(performance.now() - start);
        return createCheckResult(this.name, findings, durationMs);
      }

      const balance = await pay.getBalance();

      if (balance && typeof balance === "object") {
        const b = balance as Record<string, unknown>;

        // BL-001: Zero balance
        const amount = b.balance ?? b.amount ?? b.credits;
        if (typeof amount === "number" && amount <= 0) {
          findings.push(
            createFinding({
              id: "BL-001",
              checkName: this.name,
              severity: "HIGH",
              title: "Zero or negative balance",
              description: `Agent wallet balance is ${amount}`,
              remediation: "Top up the agent wallet to prevent service disruption",
              location: "nexus:pay:balance",
              owaspRef: ["ASI08"],
            }),
          );
        }

        // BL-002: No budget limit
        const limit = b.budgetLimit ?? b.budget_limit ?? b.limit;
        if (limit === undefined || limit === null) {
          findings.push(
            createFinding({
              id: "BL-002",
              checkName: this.name,
              severity: "MEDIUM",
              title: "No budget limit configured",
              description: "Agent has no budget limit — spending is unbounded",
              remediation: "Set a budget limit in the agent manifest or Nexus dashboard",
              location: "nexus:pay:config",
              owaspRef: ["ASI08"],
            }),
          );
        }

        // BL-003: Exceeds zone budget
        const zoneBudget = b.zoneBudget ?? b.zone_budget;
        if (typeof amount === "number" && typeof zoneBudget === "number" && amount > zoneBudget) {
          findings.push(
            createFinding({
              id: "BL-003",
              checkName: this.name,
              severity: "CRITICAL",
              title: "Budget exceeds zone allocation",
              description: `Agent balance (${amount}) exceeds zone budget (${zoneBudget})`,
              remediation: "Reconcile agent budgets with zone allocations",
              location: "nexus:pay:zone",
              owaspRef: ["ASI08"],
            }),
          );
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
