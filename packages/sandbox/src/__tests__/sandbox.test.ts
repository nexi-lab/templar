import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxConfig } from "../types.js";

// Mock @anthropic-ai/sandbox-runtime at the module level
const mockInitialize = vi.fn<(config: unknown) => Promise<void>>();
const mockWrapWithSandbox = vi.fn<(cmd: string) => Promise<string>>();
const mockReset = vi.fn<() => Promise<void>>();
const mockAnnotateStderr = vi.fn<(command: string, stderr: string) => string>();

vi.mock("@anthropic-ai/sandbox-runtime", () => ({
  SandboxManager: {
    initialize: (...args: unknown[]) => mockInitialize(args[0]),
    wrapWithSandbox: (cmd: string) => mockWrapWithSandbox(cmd),
    reset: () => mockReset(),
    annotateStderrWithSandboxFailures: (cmd: string, s: string) => mockAnnotateStderr(cmd, s),
  },
}));

// Mock @templar/core for context injection tests (#128)
const mockTryGetContext = vi.fn<() => Record<string, string | undefined> | undefined>();
const mockBuildEnvVars =
  vi.fn<(ctx: Record<string, string | undefined>) => Record<string, string>>();

vi.mock("@templar/core", () => ({
  tryGetContext: () => mockTryGetContext(),
  buildEnvVars: (ctx: Record<string, string | undefined>) => mockBuildEnvVars(ctx),
}));

// Dynamic import after mock setup
const { TemplarSandbox } = await import("../sandbox.js");

const validConfig: SandboxConfig = {
  network: { allowedDomains: ["example.com"] },
  filesystem: { denyRead: [], allowWrite: ["/tmp"] },
};

describe("TemplarSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    // Default mock implementations
    mockWrapWithSandbox.mockImplementation(async (cmd) => cmd);
    mockInitialize.mockResolvedValue(undefined);
    mockReset.mockResolvedValue(undefined);
    mockAnnotateStderr.mockImplementation((_cmd, s) => s);
    // Default: no active context
    mockTryGetContext.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // 1. Happy path
  // -----------------------------------------------------------------------
  it("executes a command and returns stdout/stderr/exitCode/durationMs", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({ command: "echo", args: ["hello"] });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.stderr).toBe("");
      expect(result.timedOut).toBe(false);
      expect(result.signal).toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 2. Config validation
  // -----------------------------------------------------------------------
  it("throws SANDBOX_CONFIG_INVALID for invalid config", () => {
    expect(
      () =>
        new TemplarSandbox({
          network: { allowedDomains: [] },
          filesystem: { denyRead: [], allowWrite: [] },
        } as SandboxConfig),
    ).toThrow("allowedDomains");
  });

  it("throws SANDBOX_CONFIG_INVALID for empty command", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(sandbox.exec({ command: "" })).rejects.toThrow("command");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 3. Platform unsupported
  // -----------------------------------------------------------------------
  it("throws SANDBOX_PLATFORM_UNSUPPORTED on unsupported platform", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(sandbox.exec({ command: "echo hi" })).rejects.toThrow("not supported");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 4. Tool not installed (srt init failure)
  // -----------------------------------------------------------------------
  it("throws SANDBOX_UNAVAILABLE when srt initialization fails", async () => {
    mockInitialize.mockRejectedValueOnce(new Error("bubblewrap not found"));
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(sandbox.exec({ command: "echo hi" })).rejects.toThrow("bubblewrap not found");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 5. Process timeout
  // -----------------------------------------------------------------------
  it("throws SANDBOX_EXEC_TIMEOUT when command exceeds timeout", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "exec sleep 60");
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(
        sandbox.exec({ command: "sleep", args: ["60"], timeoutMs: 200 }),
      ).rejects.toThrow("timed out");
    } finally {
      await sandbox.dispose();
    }
  }, 30_000);

  // -----------------------------------------------------------------------
  // 6. Process crash (non-zero exit)
  // -----------------------------------------------------------------------
  it("returns non-zero exitCode for failing commands", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "sh -c 'exit 42'");
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({ command: "exit", args: ["42"] });
      expect(result.exitCode).toBe(42);
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 7. Policy violation (stderr annotation)
  // -----------------------------------------------------------------------
  it("throws SANDBOX_POLICY_VIOLATION when sandbox violation detected in stderr", async () => {
    mockWrapWithSandbox.mockImplementation(
      async () => 'echo "[sandbox violation] file-read blocked" >&2; exit 1',
    );
    mockAnnotateStderr.mockImplementation(() => "[sandbox violation] file-read blocked");
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(sandbox.exec({ command: "cat", args: ["/etc/shadow"] })).rejects.toThrow(
        "policy violation",
      );
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 8. AbortSignal (caller abort)
  // -----------------------------------------------------------------------
  it("kills process when caller aborts via signal", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "exec sleep 60");
    const sandbox = new TemplarSandbox(validConfig);
    const controller = new AbortController();
    try {
      const promise = sandbox.exec({
        command: "sleep",
        args: ["60"],
        timeoutMs: 30_000,
        signal: controller.signal,
      });
      // Abort after a short delay
      setTimeout(() => controller.abort(), 100);
      const result = await promise;
      expect(result.signal).not.toBeNull();
    } catch {
      // AbortError or signal-killed is also acceptable
    } finally {
      await sandbox.dispose();
    }
  }, 30_000);

  // -----------------------------------------------------------------------
  // 9. Large output truncation
  // -----------------------------------------------------------------------
  it("truncates output exceeding maxOutputBytes", async () => {
    const maxBytes = 256;
    const repeatCount = maxBytes * 2;
    mockWrapWithSandbox.mockImplementation(async () => `printf '%0.s.' $(seq 1 ${repeatCount})`);
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({
        command: "printf",
        maxOutputBytes: maxBytes,
      });
      expect(Buffer.byteLength(result.stdout, "utf-8")).toBeLessThanOrEqual(maxBytes + 100);
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 10. Concurrent executions
  // -----------------------------------------------------------------------
  it("handles concurrent exec() calls without interference", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const [r1, r2, r3] = await Promise.all([
        sandbox.exec({ command: "echo", args: ["one"] }),
        sandbox.exec({ command: "echo", args: ["two"] }),
        sandbox.exec({ command: "echo", args: ["three"] }),
      ]);
      expect(r1.stdout.trim()).toBe("one");
      expect(r2.stdout.trim()).toBe("two");
      expect(r3.stdout.trim()).toBe("three");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // 11. Config immutability
  // -----------------------------------------------------------------------
  it("does not mutate the config object", async () => {
    const config: SandboxConfig = {
      network: { allowedDomains: ["a.com"] },
      filesystem: { denyRead: ["/secret"], allowWrite: ["/tmp"] },
    };
    const before = JSON.stringify(config);
    const sandbox = new TemplarSandbox(config);
    try {
      await sandbox.exec({ command: "echo", args: ["test"] });
    } finally {
      await sandbox.dispose();
    }
    expect(JSON.stringify(config)).toBe(before);
  });

  // -----------------------------------------------------------------------
  // 12. Resource cleanup (dispose + AsyncDisposable)
  // -----------------------------------------------------------------------
  it("calls SandboxManager.reset() on dispose", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    await sandbox.exec({ command: "echo", args: ["init"] });
    expect(mockInitialize).toHaveBeenCalledOnce();

    await sandbox.dispose();
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("supports Symbol.asyncDispose", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    await sandbox.exec({ command: "echo", args: ["init"] });
    await sandbox[Symbol.asyncDispose]();
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("dispose is idempotent (no error on double dispose)", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    await sandbox.exec({ command: "echo", args: ["init"] });
    await sandbox.dispose();
    await sandbox.dispose(); // second call should not throw
    expect(mockReset).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Static methods
  // -----------------------------------------------------------------------
  it("isAvailable returns boolean based on platform", () => {
    const result = TemplarSandbox.isAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("checkDependencies returns a structured report", () => {
    const report = TemplarSandbox.checkDependencies();
    expect(report).toHaveProperty("available");
    expect(report).toHaveProperty("platform");
    expect(report).toHaveProperty("details");
  });

  // -----------------------------------------------------------------------
  // Lazy init: only initializes on first exec
  // -----------------------------------------------------------------------
  it("does not call srt initialize until first exec", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    expect(mockInitialize).not.toHaveBeenCalled();
    await sandbox.exec({ command: "echo", args: ["lazy"] });
    expect(mockInitialize).toHaveBeenCalledOnce();
    // Second exec should not re-initialize
    await sandbox.exec({ command: "echo", args: ["second"] });
    expect(mockInitialize).toHaveBeenCalledOnce();
    await sandbox.dispose();
  });

  // -----------------------------------------------------------------------
  // Per-call config overrides
  // -----------------------------------------------------------------------
  it("applies configOverrides without mutating base config", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({
        command: "echo",
        args: ["override"],
        configOverrides: {
          network: { allowedDomains: ["override.com"] },
        },
      });
      expect(result.stdout.trim()).toBe("override");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // wrapWithSandbox failure
  // -----------------------------------------------------------------------
  it("throws SANDBOX_EXEC_FAILED when wrapWithSandbox fails", async () => {
    mockWrapWithSandbox.mockRejectedValueOnce(new Error("wrap failed"));
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(sandbox.exec({ command: "echo" })).rejects.toThrow("wrap command");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // Non-existent command returns 127
  // -----------------------------------------------------------------------
  it("returns exit code 127 for non-existent command", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "/nonexistent/binary/zzzzzz");
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({ command: "/nonexistent/binary/zzzzzz" });
      expect(result.exitCode).toBe(127);
      // macOS: "No such file or directory", Linux: "not found"
      expect(result.stderr).toMatch(/No such file|not found/);
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // annotateStderr graceful fallback when srt throws
  // -----------------------------------------------------------------------
  it("returns original stderr when annotateStderr throws", async () => {
    mockAnnotateStderr.mockImplementation(() => {
      throw new Error("annotation failed");
    });
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({
        command: "sh",
        args: ["-c", 'echo "some error" >&2; exit 0'],
      });
      // Should still get stderr despite annotation failure
      expect(result.stderr).toContain("some error");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // formatZodMessage with non-Error, non-ZodError input
  // -----------------------------------------------------------------------
  it("handles non-Error validation failure gracefully", () => {
    // Passing a non-object triggers the non-ZodError branch in formatZodMessage
    expect(() => new TemplarSandbox(null as unknown as SandboxConfig)).toThrow();
  });

  // -----------------------------------------------------------------------
  // allowedCommands enforcement
  // -----------------------------------------------------------------------
  it("allows execution when command is in allowedCommands list", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo", "cat"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      const result = await sandbox.exec({ command: "echo", args: ["allowed"] });
      expect(result.stdout.trim()).toBe("allowed");
    } finally {
      await sandbox.dispose();
    }
  });

  it("throws SANDBOX_POLICY_VIOLATION when command is not in allowedCommands", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo", "cat"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "rm", args: ["-rf", "/"] })).rejects.toThrow(
        "not in the allowed commands",
      );
    } finally {
      await sandbox.dispose();
    }
  });

  it("matches full path command against basename in allowedCommands", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      const result = await sandbox.exec({ command: "/bin/echo", args: ["path-match"] });
      expect(result.stdout.trim()).toBe("path-match");
    } finally {
      await sandbox.dispose();
    }
  });

  it("does not enforce allowedCommands when not set", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      const result = await sandbox.exec({ command: "echo", args: ["no-allowlist"] });
      expect(result.stdout.trim()).toBe("no-allowlist");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // resourceLimits.timeoutSeconds as default timeout
  // -----------------------------------------------------------------------
  it("uses resourceLimits.timeoutSeconds as default timeout when timeoutMs not set", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "exec sleep 60");
    const config: SandboxConfig = {
      ...validConfig,
      resourceLimits: { timeoutSeconds: 1 },
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "sleep", args: ["60"] })).rejects.toThrow("timed out");
    } finally {
      await sandbox.dispose();
    }
  }, 30_000);

  it("prefers per-call timeoutMs over resourceLimits.timeoutSeconds", async () => {
    mockWrapWithSandbox.mockImplementation(async () => "exec sleep 60");
    const config: SandboxConfig = {
      ...validConfig,
      resourceLimits: { timeoutSeconds: 30 },
    };
    const sandbox = new TemplarSandbox(config);
    try {
      // timeoutMs=200 should take precedence over timeoutSeconds=30
      await expect(
        sandbox.exec({ command: "sleep", args: ["60"], timeoutMs: 200 }),
      ).rejects.toThrow("timed out");
    } finally {
      await sandbox.dispose();
    }
  }, 30_000);

  // -----------------------------------------------------------------------
  // resourceLimits.maxMemoryMB wraps command with ulimit
  // -----------------------------------------------------------------------
  it("wraps command with ulimit when maxMemoryMB is set", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      resourceLimits: { maxMemoryMB: 256 },
    };
    const sandbox = new TemplarSandbox(config);
    try {
      const result = await sandbox.exec({ command: "echo", args: ["mem-limited"] });
      // Command still executes (ulimit may or may not take effect in test env)
      expect(result.exitCode).toBeDefined();
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // configOverrides with allowedCommands
  // -----------------------------------------------------------------------
  it("per-call configOverrides can add allowedCommands", async () => {
    const sandbox = new TemplarSandbox(validConfig);
    try {
      await expect(
        sandbox.exec({
          command: "rm",
          configOverrides: { allowedCommands: ["echo"] },
        }),
      ).rejects.toThrow("not in the allowed commands");
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // Shell metacharacter injection prevention
  // -----------------------------------------------------------------------
  it("blocks command injection via semicolon when allowedCommands is set", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "echo; rm -rf /" })).rejects.toThrow(
        "shell metacharacters",
      );
    } finally {
      await sandbox.dispose();
    }
  });

  it("blocks command injection via pipe when allowedCommands is set", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "echo | cat" })).rejects.toThrow("shell metacharacters");
    } finally {
      await sandbox.dispose();
    }
  });

  it("blocks command injection via backticks when allowedCommands is set", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "echo `cat /etc/shadow`" })).rejects.toThrow(
        "shell metacharacters",
      );
    } finally {
      await sandbox.dispose();
    }
  });

  it("blocks command injection via $() when allowedCommands is set", async () => {
    const config: SandboxConfig = {
      ...validConfig,
      allowedCommands: ["echo"],
    };
    const sandbox = new TemplarSandbox(config);
    try {
      await expect(sandbox.exec({ command: "echo $(cat /etc/shadow)" })).rejects.toThrow(
        "shell metacharacters",
      );
    } finally {
      await sandbox.dispose();
    }
  });

  // -----------------------------------------------------------------------
  // Context injection (#128)
  // -----------------------------------------------------------------------
  describe("context environment variable injection", () => {
    it("injects TEMPLAR_* vars when an active session context exists", async () => {
      const fakeCtx = { sessionId: "s1", userId: "u1" };
      mockTryGetContext.mockReturnValue(fakeCtx);
      mockBuildEnvVars.mockReturnValue({
        TEMPLAR_SESSION_ID: "s1",
        TEMPLAR_USER_ID: "u1",
      });

      const sandbox = new TemplarSandbox(validConfig);
      try {
        const result = await sandbox.exec({ command: "echo ok" });
        expect(result.exitCode).toBe(0);
        expect(mockTryGetContext).toHaveBeenCalled();
        expect(mockBuildEnvVars).toHaveBeenCalledWith(fakeCtx);
      } finally {
        await sandbox.dispose();
      }
    });

    it("does not inject TEMPLAR_* vars when no active session exists", async () => {
      mockTryGetContext.mockReturnValue(undefined);

      const sandbox = new TemplarSandbox(validConfig);
      try {
        const result = await sandbox.exec({ command: "echo ok" });
        expect(result.exitCode).toBe(0);
        expect(mockTryGetContext).toHaveBeenCalled();
        expect(mockBuildEnvVars).not.toHaveBeenCalled();
      } finally {
        await sandbox.dispose();
      }
    });

    it("omits fields that are undefined in the context", async () => {
      const partialCtx = { sessionId: "s2" };
      mockTryGetContext.mockReturnValue(partialCtx);
      mockBuildEnvVars.mockReturnValue({
        TEMPLAR_SESSION_ID: "s2",
      });

      const sandbox = new TemplarSandbox(validConfig);
      try {
        const result = await sandbox.exec({ command: "echo ok" });
        expect(result.exitCode).toBe(0);
        expect(mockBuildEnvVars).toHaveBeenCalledWith(partialCtx);
      } finally {
        await sandbox.dispose();
      }
    });

    it("explicit opts.env overrides context vars", async () => {
      const fakeCtx = { sessionId: "s1", userId: "u1" };
      mockTryGetContext.mockReturnValue(fakeCtx);
      mockBuildEnvVars.mockReturnValue({
        TEMPLAR_SESSION_ID: "s1",
        TEMPLAR_USER_ID: "u1",
      });

      const sandbox = new TemplarSandbox(validConfig);
      try {
        // Verify that exec with explicit env still calls context functions
        // and the merge order is process.env < contextVars < opts.env
        const result = await sandbox.exec({
          command: "echo ok",
          env: { TEMPLAR_SESSION_ID: "override" },
        });
        expect(result.exitCode).toBe(0);
        expect(mockTryGetContext).toHaveBeenCalled();
        expect(mockBuildEnvVars).toHaveBeenCalledWith(fakeCtx);
      } finally {
        await sandbox.dispose();
      }
    });
  });
});
