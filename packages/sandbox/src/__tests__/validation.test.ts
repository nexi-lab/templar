import { describe, expect, it } from "vitest";
import { validateExecOptions, validateSandboxConfig } from "../validation.js";

describe("validateSandboxConfig", () => {
  const validConfig = {
    network: {
      allowedDomains: ["example.com"],
    },
    filesystem: {
      denyRead: ["~/.ssh"],
      allowWrite: ["/tmp"],
    },
  };

  it("accepts a valid minimal config", () => {
    const result = validateSandboxConfig(validConfig);
    expect(result.network.allowedDomains).toEqual(["example.com"]);
    expect(result.filesystem.denyRead).toEqual(["~/.ssh"]);
    expect(result.filesystem.allowWrite).toEqual(["/tmp"]);
  });

  it("accepts config with all optional fields", () => {
    const full = {
      network: {
        allowedDomains: ["*.github.com"],
        deniedDomains: ["evil.com"],
        allowLocalBinding: true,
        allowUnixSockets: ["/var/run/docker.sock"],
      },
      filesystem: {
        denyRead: ["/etc/shadow"],
        allowWrite: ["/tmp", "/var/log"],
        denyWrite: ["/var/log/audit"],
      },
      ignoreViolations: { curl: ["/etc/ssl/certs"] },
    };
    const result = validateSandboxConfig(full);
    expect(result.network.deniedDomains).toEqual(["evil.com"]);
    expect(result.network.allowLocalBinding).toBe(true);
    expect(result.filesystem.denyWrite).toEqual(["/var/log/audit"]);
    expect(result.ignoreViolations).toEqual({ curl: ["/etc/ssl/certs"] });
  });

  it("rejects empty allowedDomains", () => {
    expect(() =>
      validateSandboxConfig({
        network: { allowedDomains: [] },
        filesystem: { denyRead: [], allowWrite: [] },
      }),
    ).toThrow("allowedDomains");
  });

  it("rejects missing network field", () => {
    expect(() =>
      validateSandboxConfig({
        filesystem: { denyRead: [], allowWrite: [] },
      }),
    ).toThrow();
  });

  it("rejects missing filesystem field", () => {
    expect(() =>
      validateSandboxConfig({
        network: { allowedDomains: ["a.com"] },
      }),
    ).toThrow();
  });

  it("rejects empty string in allowedDomains", () => {
    expect(() =>
      validateSandboxConfig({
        network: { allowedDomains: [""] },
        filesystem: { denyRead: [], allowWrite: [] },
      }),
    ).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => validateSandboxConfig("bad")).toThrow();
    expect(() => validateSandboxConfig(null)).toThrow();
    expect(() => validateSandboxConfig(42)).toThrow();
  });

  it("accepts config with allowedCommands", () => {
    const result = validateSandboxConfig({
      ...validConfig,
      allowedCommands: ["echo", "cat", "/usr/bin/python3"],
    });
    expect(result.allowedCommands).toEqual(["echo", "cat", "/usr/bin/python3"]);
  });

  it("rejects empty string in allowedCommands", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        allowedCommands: [""],
      }),
    ).toThrow();
  });

  it("accepts config with resourceLimits", () => {
    const result = validateSandboxConfig({
      ...validConfig,
      resourceLimits: {
        maxMemoryMB: 512,
        maxCPUPercent: 50,
        timeoutSeconds: 30,
      },
    });
    expect(result.resourceLimits?.maxMemoryMB).toBe(512);
    expect(result.resourceLimits?.maxCPUPercent).toBe(50);
    expect(result.resourceLimits?.timeoutSeconds).toBe(30);
  });

  it("rejects negative maxMemoryMB", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        resourceLimits: { maxMemoryMB: -100 },
      }),
    ).toThrow("maxMemoryMB");
  });

  it("rejects maxCPUPercent over 100", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        resourceLimits: { maxCPUPercent: 150 },
      }),
    ).toThrow("maxCPUPercent");
  });

  it("rejects maxCPUPercent of 0", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        resourceLimits: { maxCPUPercent: 0 },
      }),
    ).toThrow("maxCPUPercent");
  });

  it("rejects non-integer timeoutSeconds in resourceLimits", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        resourceLimits: { timeoutSeconds: 1.5 },
      }),
    ).toThrow();
  });

  it("rejects maxMemoryMB exceeding upper bound", () => {
    expect(() =>
      validateSandboxConfig({
        ...validConfig,
        resourceLimits: { maxMemoryMB: 20_000_000 },
      }),
    ).toThrow("maxMemoryMB");
  });
});

describe("validateExecOptions", () => {
  it("accepts valid minimal options", () => {
    const result = validateExecOptions({ command: "echo hello" });
    expect(result.command).toBe("echo hello");
  });

  it("accepts options with all fields", () => {
    const result = validateExecOptions({
      command: "curl",
      args: ["-s", "https://example.com"],
      cwd: "/tmp",
      env: { FOO: "bar" },
      timeoutMs: 5000,
      maxOutputBytes: 512,
    });
    expect(result.command).toBe("curl");
    expect(result.args).toEqual(["-s", "https://example.com"]);
    expect(result.timeoutMs).toBe(5000);
  });

  it("rejects empty command", () => {
    expect(() => validateExecOptions({ command: "" })).toThrow("command");
  });

  it("rejects negative timeoutMs", () => {
    expect(() => validateExecOptions({ command: "echo", timeoutMs: -1 })).toThrow("timeoutMs");
  });

  it("rejects zero timeoutMs", () => {
    expect(() => validateExecOptions({ command: "echo", timeoutMs: 0 })).toThrow("timeoutMs");
  });

  it("rejects negative maxOutputBytes", () => {
    expect(() => validateExecOptions({ command: "echo", maxOutputBytes: -100 })).toThrow(
      "maxOutputBytes",
    );
  });

  it("rejects non-integer timeoutMs", () => {
    expect(() => validateExecOptions({ command: "echo", timeoutMs: 1.5 })).toThrow();
  });
});
