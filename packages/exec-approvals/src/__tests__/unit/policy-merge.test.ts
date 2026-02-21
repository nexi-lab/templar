import type { ExecPolicyResponse } from "@nexus/sdk";
import { describe, expect, it } from "vitest";
import { resolveExecApprovalsConfig } from "../../config.js";
import { applyDangerousFlagOverrides, mergePolicy } from "../../policy-merge.js";
import type { ResolvedExecApprovalsConfig } from "../../types.js";

function makeLocalConfig(
  overrides?: Partial<ResolvedExecApprovalsConfig>,
): ResolvedExecApprovalsConfig {
  const base = resolveExecApprovalsConfig({});
  return { ...base, ...overrides };
}

function makeRemotePolicy(overrides?: Partial<ExecPolicyResponse>): ExecPolicyResponse {
  return {
    policy_id: "pol-1",
    additional_safe_binaries: [],
    removed_safe_binaries: [],
    additional_never_allow: [],
    auto_promote_threshold: null,
    max_patterns: null,
    dangerous_flag_overrides: [],
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mergePolicy", () => {
  it("should return unchanged config when remote is empty", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy();

    const merged = mergePolicy(local, remote);

    expect(merged.autoPromoteThreshold).toBe(local.autoPromoteThreshold);
    expect(merged.maxPatterns).toBe(local.maxPatterns);
    expect(merged.additionalNeverAllow).toEqual([]);
  });

  it("should add additional safe binaries", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy({
      additional_safe_binaries: ["custom-tool", "my-cli"],
    });

    const merged = mergePolicy(local, remote);

    expect(merged.safeBinaries.has("custom-tool")).toBe(true);
    expect(merged.safeBinaries.has("my-cli")).toBe(true);
    // Original binaries still present
    expect(merged.safeBinaries.has("ls")).toBe(true);
  });

  it("should remove safe binaries", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy({
      removed_safe_binaries: ["xargs", "find"],
    });

    const merged = mergePolicy(local, remote);

    expect(merged.safeBinaries.has("xargs")).toBe(false);
    expect(merged.safeBinaries.has("find")).toBe(false);
    // Other binaries still present
    expect(merged.safeBinaries.has("ls")).toBe(true);
  });

  it("should override auto_promote_threshold when non-null", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy({
      auto_promote_threshold: 10,
    });

    const merged = mergePolicy(local, remote);

    expect(merged.autoPromoteThreshold).toBe(10);
  });

  it("should not override auto_promote_threshold when null", () => {
    const local = makeLocalConfig({ autoPromoteThreshold: 3 });
    const remote = makeRemotePolicy({
      auto_promote_threshold: null,
    });

    const merged = mergePolicy(local, remote);

    expect(merged.autoPromoteThreshold).toBe(3);
  });

  it("should override max_patterns when non-null", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy({
      max_patterns: 1000,
    });

    const merged = mergePolicy(local, remote);

    expect(merged.maxPatterns).toBe(1000);
  });

  it("should append additional_never_allow patterns", () => {
    const local = makeLocalConfig();
    const remote = makeRemotePolicy({
      additional_never_allow: ["dangerous-custom-cmd", "evil-script"],
    });

    const merged = mergePolicy(local, remote);

    expect(merged.additionalNeverAllow).toContain("dangerous-custom-cmd");
    expect(merged.additionalNeverAllow).toContain("evil-script");
  });

  it("should not mutate the original config", () => {
    const local = makeLocalConfig();
    const originalThreshold = local.autoPromoteThreshold;
    const remote = makeRemotePolicy({
      auto_promote_threshold: 99,
    });

    mergePolicy(local, remote);

    expect(local.autoPromoteThreshold).toBe(originalThreshold);
  });
});

describe("applyDangerousFlagOverrides", () => {
  it("should add new flags to existing binary", () => {
    const overrides = [
      {
        binary: "rm",
        flags: ["--no-preserve-root"],
        risk: "high",
        reason: "dangerous flag",
        action: "add" as const,
      },
    ];

    const result = applyDangerousFlagOverrides(overrides);
    const rmPattern = result.find((p) => p.binary === "rm");

    expect(rmPattern).toBeDefined();
    expect(rmPattern?.flags).toContain("--no-preserve-root");
    // Original flags preserved
    expect(rmPattern?.flags).toContain("-rf");
  });

  it("should add new binary pattern", () => {
    const overrides = [
      {
        binary: "custom-danger",
        flags: ["--nuke"],
        risk: "critical",
        reason: "custom dangerous tool",
        action: "add" as const,
      },
    ];

    const result = applyDangerousFlagOverrides(overrides);
    const custom = result.find((p) => p.binary === "custom-danger");

    expect(custom).toBeDefined();
    expect(custom?.flags).toEqual(["--nuke"]);
    expect(custom?.risk).toBe("critical");
  });

  it("should remove flags from existing binary", () => {
    const overrides = [
      {
        binary: "docker",
        flags: ["run"],
        risk: "medium",
        reason: "safe in our context",
        action: "remove" as const,
      },
    ];

    const result = applyDangerousFlagOverrides(overrides);
    const docker = result.find((p) => p.binary === "docker");

    expect(docker).toBeDefined();
    expect(docker?.flags).not.toContain("run");
    expect(docker?.flags).toContain("exec");
  });

  it("should handle empty overrides", () => {
    const result = applyDangerousFlagOverrides([]);
    expect(result.length).toBeGreaterThan(0);
  });
});
