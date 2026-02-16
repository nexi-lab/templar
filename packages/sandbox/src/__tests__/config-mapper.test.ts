import { describe, expect, it } from "vitest";
import { mapToSrtConfig, mergeConfigs } from "../config-mapper.js";
import type { SandboxConfig } from "../types.js";

describe("mapToSrtConfig", () => {
  const baseConfig: SandboxConfig = {
    network: {
      allowedDomains: ["example.com", "*.github.com"],
    },
    filesystem: {
      denyRead: ["~/.ssh"],
      allowWrite: ["/tmp"],
    },
  };

  it("maps required fields correctly", () => {
    const srt = mapToSrtConfig(baseConfig);
    expect(srt.network.allowedDomains).toEqual(["example.com", "*.github.com"]);
    expect(srt.filesystem.denyRead).toEqual(["~/.ssh"]);
    expect(srt.filesystem.allowWrite).toEqual(["/tmp"]);
  });

  it("omits optional fields when not provided", () => {
    const srt = mapToSrtConfig(baseConfig);
    expect(srt.network).not.toHaveProperty("deniedDomains");
    expect(srt.network).not.toHaveProperty("allowLocalBinding");
    expect(srt.network).not.toHaveProperty("allowUnixSockets");
    expect(srt.filesystem).not.toHaveProperty("denyWrite");
    expect(srt).not.toHaveProperty("ignoreViolations");
  });

  it("includes optional fields when provided", () => {
    const full: SandboxConfig = {
      network: {
        allowedDomains: ["a.com"],
        deniedDomains: ["evil.com"],
        allowLocalBinding: true,
        allowUnixSockets: ["/var/run/docker.sock"],
      },
      filesystem: {
        denyRead: [],
        allowWrite: ["/tmp"],
        denyWrite: ["/tmp/secret"],
      },
      ignoreViolations: { curl: ["/etc/ssl"] },
    };
    const srt = mapToSrtConfig(full);
    expect(srt.network.deniedDomains).toEqual(["evil.com"]);
    expect(srt.network.allowLocalBinding).toBe(true);
    expect(srt.network.allowUnixSockets).toEqual(["/var/run/docker.sock"]);
    expect(srt.filesystem.denyWrite).toEqual(["/tmp/secret"]);
    expect(srt.ignoreViolations).toEqual({ curl: ["/etc/ssl"] });
  });

  it("does not mutate the input config", () => {
    const config: SandboxConfig = {
      network: { allowedDomains: ["a.com"] },
      filesystem: { denyRead: [], allowWrite: ["/tmp"] },
    };
    const before = JSON.stringify(config);
    mapToSrtConfig(config);
    expect(JSON.stringify(config)).toBe(before);
  });
});

describe("mergeConfigs", () => {
  const base: SandboxConfig = {
    network: {
      allowedDomains: ["base.com"],
      deniedDomains: ["evil.com"],
    },
    filesystem: {
      denyRead: ["/secret"],
      allowWrite: ["/tmp"],
    },
    ignoreViolations: { git: ["/etc/gitconfig"] },
  };

  it("overrides network fields", () => {
    const merged = mergeConfigs(base, {
      network: { allowedDomains: ["override.com"] },
    });
    expect(merged.network.allowedDomains).toEqual(["override.com"]);
  });

  it("overrides filesystem fields", () => {
    const merged = mergeConfigs(base, {
      filesystem: { denyRead: ["/other"], allowWrite: ["/var"] },
    });
    expect(merged.filesystem.denyRead).toEqual(["/other"]);
    expect(merged.filesystem.allowWrite).toEqual(["/var"]);
  });

  it("overrides ignoreViolations when provided", () => {
    const merged = mergeConfigs(base, {
      ignoreViolations: { curl: ["/etc/ssl"] },
    });
    expect(merged.ignoreViolations).toEqual({ curl: ["/etc/ssl"] });
  });

  it("preserves base ignoreViolations when not overridden", () => {
    const merged = mergeConfigs(base, {
      network: { allowedDomains: ["other.com"] },
    });
    expect(merged.ignoreViolations).toEqual({ git: ["/etc/gitconfig"] });
  });

  it("returns a new object (does not mutate base)", () => {
    const before = JSON.stringify(base);
    mergeConfigs(base, { network: { allowedDomains: ["x.com"] } });
    expect(JSON.stringify(base)).toBe(before);
  });

  it("handles empty overrides", () => {
    const merged = mergeConfigs(base, {});
    expect(merged.network.allowedDomains).toEqual(base.network.allowedDomains);
    expect(merged.filesystem.denyRead).toEqual(base.filesystem.denyRead);
  });

  it("preserves base allowedCommands when not overridden", () => {
    const baseWithCmds: SandboxConfig = {
      ...base,
      allowedCommands: ["echo", "cat"],
    };
    const merged = mergeConfigs(baseWithCmds, {
      network: { allowedDomains: ["other.com"] },
    });
    expect(merged.allowedCommands).toEqual(["echo", "cat"]);
  });

  it("overrides allowedCommands when provided", () => {
    const baseWithCmds: SandboxConfig = {
      ...base,
      allowedCommands: ["echo", "cat"],
    };
    const merged = mergeConfigs(baseWithCmds, {
      allowedCommands: ["python3"],
    });
    expect(merged.allowedCommands).toEqual(["python3"]);
  });

  it("preserves base resourceLimits when not overridden", () => {
    const baseWithLimits: SandboxConfig = {
      ...base,
      resourceLimits: { maxMemoryMB: 512 },
    };
    const merged = mergeConfigs(baseWithLimits, {
      network: { allowedDomains: ["other.com"] },
    });
    expect(merged.resourceLimits?.maxMemoryMB).toBe(512);
  });

  it("overrides resourceLimits when provided", () => {
    const baseWithLimits: SandboxConfig = {
      ...base,
      resourceLimits: { maxMemoryMB: 512 },
    };
    const merged = mergeConfigs(baseWithLimits, {
      resourceLimits: { maxMemoryMB: 1024, maxCPUPercent: 50 },
    });
    expect(merged.resourceLimits?.maxMemoryMB).toBe(1024);
    expect(merged.resourceLimits?.maxCPUPercent).toBe(50);
  });

  it("does not include allowedCommands when neither base nor override has it", () => {
    const merged = mergeConfigs(base, {});
    expect(merged).not.toHaveProperty("allowedCommands");
  });

  it("does not include resourceLimits when neither base nor override has it", () => {
    const merged = mergeConfigs(base, {});
    expect(merged).not.toHaveProperty("resourceLimits");
  });
});
