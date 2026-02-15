import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TemplarSandbox } from "../sandbox.js";
import type { SandboxConfig } from "../types.js";

/**
 * Integration tests — only run when sandbox dependencies are actually
 * available on the current platform (macOS Seatbelt or Linux bubblewrap).
 *
 * We probe availability by attempting a real exec() rather than just
 * checking process.platform, since CI Linux runners may lack bwrap/rg/socat.
 */
let canRun = false;
try {
  const probe = new TemplarSandbox({
    network: { allowedDomains: ["localhost"] },
    filesystem: { denyRead: [], allowWrite: [] },
  });
  await probe.exec({ command: "echo", args: ["probe"], timeoutMs: 5_000 });
  await probe.dispose();
  canRun = true;
} catch {
  canRun = false;
}

describe.runIf(canRun)("TemplarSandbox integration", () => {
  const config: SandboxConfig = {
    network: {
      allowedDomains: ["example.com"],
    },
    filesystem: {
      denyRead: [],
      allowWrite: ["/tmp"],
    },
  };

  let sandbox: InstanceType<typeof TemplarSandbox>;

  beforeAll(() => {
    sandbox = new TemplarSandbox(config);
  });

  afterAll(async () => {
    await sandbox.dispose();
  });

  // -----------------------------------------------------------------------
  // 1. Real exec: echo inside sandbox
  // -----------------------------------------------------------------------
  it("executes echo inside sandbox and captures stdout", async () => {
    const result = await sandbox.exec({
      command: "echo",
      args: ["hello sandbox"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello sandbox");
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // 2. Timeout enforcement
  // -----------------------------------------------------------------------
  it("kills long-running process on timeout", async () => {
    await expect(
      sandbox.exec({
        command: "sleep",
        args: ["60"],
        timeoutMs: 500,
      }),
    ).rejects.toThrow("timed out");
  }, 10_000);

  // -----------------------------------------------------------------------
  // 3. Non-zero exit code
  // -----------------------------------------------------------------------
  it("captures non-zero exit code", async () => {
    const result = await sandbox.exec({
      command: "sh",
      args: ["-c", "exit 7"],
    });
    expect(result.exitCode).toBe(7);
  });

  // -----------------------------------------------------------------------
  // 4. Environment variables
  // -----------------------------------------------------------------------
  it("passes environment variables to the sandboxed process", async () => {
    const result = await sandbox.exec({
      command: "sh",
      args: ["-c", "echo $SANDBOX_TEST_VAR"],
      env: { SANDBOX_TEST_VAR: "sandbox_value" },
    });
    expect(result.stdout.trim()).toBe("sandbox_value");
  });

  // -----------------------------------------------------------------------
  // 5. Cleanup: dispose stops proxy
  // -----------------------------------------------------------------------
  it("dispose completes without error", async () => {
    const localSandbox = new TemplarSandbox(config);
    await localSandbox.exec({ command: "echo", args: ["cleanup-test"] });
    await expect(localSandbox.dispose()).resolves.toBeUndefined();
  });
});
