import { describe, expect, it } from "vitest";
import { createSandboxConfig } from "../profiles.js";
import type { SandboxConfig } from "../types.js";

describe("createSandboxConfig", () => {
  // -----------------------------------------------------------------------
  // Restrictive profile
  // -----------------------------------------------------------------------
  it('returns restrictive defaults with "restrictive" profile', () => {
    const config = createSandboxConfig("restrictive");
    expect(config.network.allowedDomains).toEqual(["localhost"]);
    expect(config.filesystem.allowWrite).toEqual([]);
    expect(config.filesystem.denyRead).toContain("~/.ssh");
    expect(config.filesystem.denyRead).toContain("/etc/shadow");
  });

  it("merges overrides on top of restrictive defaults", () => {
    const config = createSandboxConfig("restrictive", {
      allowedCommands: ["echo", "cat"],
    });
    expect(config.network.allowedDomains).toEqual(["localhost"]);
    expect(config.allowedCommands).toEqual(["echo", "cat"]);
  });

  it("allows network override on restrictive profile", () => {
    const config = createSandboxConfig("restrictive", {
      network: { allowedDomains: ["api.example.com"] },
    });
    expect(config.network.allowedDomains).toEqual(["api.example.com"]);
    // Filesystem should still be restrictive default
    expect(config.filesystem.allowWrite).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Permissive profile
  // -----------------------------------------------------------------------
  it('returns permissive defaults with "permissive" profile', () => {
    const config = createSandboxConfig("permissive");
    expect(config.network.allowedDomains).toEqual(["*"]);
    expect(config.filesystem.allowWrite).toContain("/tmp");
    expect(config.filesystem.allowWrite).toContain("/var/tmp");
    expect(config.filesystem.denyRead).toContain("~/.ssh");
  });

  it("merges resource limits onto permissive profile", () => {
    const config = createSandboxConfig("permissive", {
      resourceLimits: { maxMemoryMB: 512 },
    });
    expect(config.network.allowedDomains).toEqual(["*"]);
    expect(config.resourceLimits?.maxMemoryMB).toBe(512);
  });

  // -----------------------------------------------------------------------
  // Custom profile
  // -----------------------------------------------------------------------
  it('returns overrides as-is for "custom" profile', () => {
    const custom: SandboxConfig = {
      network: { allowedDomains: ["custom.io"] },
      filesystem: { denyRead: [], allowWrite: ["/data"] },
      allowedCommands: ["python3"],
    };
    const config = createSandboxConfig("custom", custom);
    expect(config).toEqual(custom);
  });

  it('throws when "custom" profile is missing required fields', () => {
    expect(() => createSandboxConfig("custom")).toThrow("requires overrides");
    expect(() => createSandboxConfig("custom", {})).toThrow("requires overrides");
    expect(() =>
      createSandboxConfig("custom", {
        network: { allowedDomains: ["a.com"] },
      }),
    ).toThrow("requires overrides");
  });

  // -----------------------------------------------------------------------
  // Immutability
  // -----------------------------------------------------------------------
  it("does not mutate the overrides object", () => {
    const overrides = {
      allowedCommands: ["echo"],
      network: { allowedDomains: ["override.com"] },
    };
    const before = JSON.stringify(overrides);
    createSandboxConfig("restrictive", overrides);
    expect(JSON.stringify(overrides)).toBe(before);
  });

  // -----------------------------------------------------------------------
  // ignoreViolations passthrough
  // -----------------------------------------------------------------------
  it("preserves ignoreViolations from overrides", () => {
    const config = createSandboxConfig("permissive", {
      ignoreViolations: { curl: ["/etc/ssl/certs"] },
    });
    expect(config.ignoreViolations).toEqual({ curl: ["/etc/ssl/certs"] });
  });
});
