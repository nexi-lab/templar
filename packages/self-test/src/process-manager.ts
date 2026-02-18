import { type ChildProcess, spawn } from "node:child_process";

import type { DevServerConfig } from "./types.js";

const SIGKILL_DELAY_MS = 5_000;
const BACKOFF_BASE_MS = 100;
const BACKOFF_CAP_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function getBackoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

async function pollUrl(url: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) return false;

    try {
      const response = await fetch(url, { method: "GET", ...(signal ? { signal } : {}) });
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }

    const delay = getBackoffDelay(attempt);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.min(delay, remaining));
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    attempt++;
  }

  return false;
}

function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.killed) {
      resolve();
      return;
    }

    const forceKill = setTimeout(() => {
      if (proc.exitCode === null && !proc.killed) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, SIGKILL_DELAY_MS);

    proc.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}

/**
 * ProcessManager — manages dev server process lifecycle.
 *
 * Spawns dev server processes, polls until healthy, and ensures
 * cleanup on shutdown. Supports reusing existing processes.
 */
export class ProcessManager {
  private readonly processes: Set<ChildProcess> = new Set();
  private cleanupRegistered = false;

  /**
   * Start a dev server. If reuseExisting is true and the URL is already
   * responding, returns immediately without spawning.
   */
  async start(config: DevServerConfig, signal?: AbortSignal): Promise<void> {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const reuseExisting = config.reuseExisting ?? true;

    // Check if server is already running
    if (reuseExisting) {
      try {
        const response = await fetch(config.url, { method: "GET" });
        if (response.ok) return;
      } catch {
        // Not running yet, spawn it
      }
    }

    // Spawn the process
    const proc = spawn(config.command, {
      shell: true,
      detached: false,
      env: { ...process.env, ...config.env },
      stdio: "pipe",
    });

    this.processes.add(proc);
    this.registerCleanup();

    // Remove from tracked set when process exits
    proc.once("exit", () => {
      this.processes.delete(proc);
    });

    // Poll until healthy
    const healthy = await pollUrl(config.url, timeoutMs, signal);

    if (!healthy) {
      // Kill the process if it didn't become healthy
      await killProcess(proc);
      this.processes.delete(proc);
      throw new Error(`Dev server failed to become healthy at ${config.url} within ${timeoutMs}ms`);
    }
  }

  /**
   * Stop all tracked processes (SIGTERM → wait 5s → SIGKILL).
   */
  async stop(): Promise<void> {
    const kills = [...this.processes].map(killProcess);
    await Promise.all(kills);
    this.processes.clear();
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = (): void => {
      for (const proc of this.processes) {
        if (proc.exitCode === null && !proc.killed) {
          proc.kill("SIGTERM");
        }
      }
    };

    process.on("exit", cleanup);
    process.on("SIGTERM", cleanup);
  }
}
