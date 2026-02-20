import type { NexusClient } from "@templar/core";
import { describe, expect, it } from "vitest";
import { BudgetLeakDetectionCheck } from "../../checks/budget-leak-detection.js";
import type { DoctorCheckContext } from "../../types.js";

function mockContext(nexus: unknown): DoctorCheckContext {
  return {
    workspace: "/tmp",
    nexus: nexus as NexusClient,
  };
}

describe("BudgetLeakDetectionCheck", () => {
  const check = new BudgetLeakDetectionCheck();

  it("auto-skips when no Nexus client", async () => {
    const result = await check.run({ workspace: "/tmp" });
    expect(result.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });

  it("detects zero balance", async () => {
    const mockNexus = {
      pay: {
        getBalance: async () => ({ balance: 0, budgetLimit: 100 }),
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.some((f) => f.id === "BL-001")).toBe(true);
  });

  it("detects missing budget limit", async () => {
    const mockNexus = {
      pay: {
        getBalance: async () => ({ balance: 100 }),
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.some((f) => f.id === "BL-002")).toBe(true);
  });

  it("passes with healthy budget", async () => {
    const mockNexus = {
      pay: {
        getBalance: async () => ({ balance: 100, budgetLimit: 500 }),
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.filter((f) => f.id === "BL-001")).toHaveLength(0);
  });

  it("handles API errors gracefully", async () => {
    const mockNexus = {
      pay: {
        getBalance: async () => {
          throw new Error("Pay API error");
        },
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.status).toBe("error");
    expect(result.error?.message).toBe("Pay API error");
  });
});
