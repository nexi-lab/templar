import type { NexusClient } from "@templar/core";
import { describe, expect, it } from "vitest";
import { MultiTenantIsolationCheck } from "../../checks/multi-tenant-isolation.js";
import type { DoctorCheckContext } from "../../types.js";

function mockContext(nexus: unknown): DoctorCheckContext {
  return {
    workspace: "/tmp",
    nexus: nexus as NexusClient,
  };
}

describe("MultiTenantIsolationCheck", () => {
  const check = new MultiTenantIsolationCheck();

  it("auto-skips when no Nexus client", async () => {
    const result = await check.run({ workspace: "/tmp" });
    expect(result.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });

  it("detects cross-zone grants", async () => {
    const mockNexus = {
      permissions: {
        listNamespaceTools: async () => [
          { id: "g1", sourceZone: "zone-a", targetZone: "zone-b", permission: "read" },
        ],
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.some((f) => f.id === "MT-001")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects wildcard permissions", async () => {
    const mockNexus = {
      permissions: {
        listNamespaceTools: async () => [
          {
            id: "g1",
            sourceZone: "zone-a",
            targetZone: "zone-a",
            permission: "*",
            resource: "tools",
          },
        ],
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.some((f) => f.id === "MT-002")).toBe(true);
  });

  it("passes with clean grants", async () => {
    const mockNexus = {
      permissions: {
        listNamespaceTools: async () => [
          {
            id: "g1",
            sourceZone: "zone-a",
            targetZone: "zone-a",
            permission: "read",
            resource: "tools.search",
            zone: "zone-a",
          },
        ],
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.findings.filter((f) => f.id === "MT-001" || f.id === "MT-002")).toHaveLength(0);
  });

  it("handles API errors gracefully", async () => {
    const mockNexus = {
      permissions: {
        listNamespaceTools: async () => {
          throw new Error("Nexus API error");
        },
      },
    };

    const result = await check.run(mockContext(mockNexus));
    expect(result.status).toBe("error");
    expect(result.error?.message).toBe("Nexus API error");
  });
});
