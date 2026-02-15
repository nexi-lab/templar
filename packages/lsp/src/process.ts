import { type ChildProcess, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { LanguageServerConfig } from "./config.js";

export type CrashCallback = (code: number | null, signal: string | null) => void;
export type ExitCallback = (code: number | null, signal: string | null) => void;

/**
 * Wraps a spawned LSP child process with lifecycle management.
 */
export class LSPProcessHandle {
  private readonly crashCallbacks: CrashCallback[] = [];
  private readonly exitCallbacks: ExitCallback[] = [];
  private exited = false;

  constructor(
    private readonly proc: ChildProcess,
    readonly languageId: string,
  ) {
    proc.on("exit", (code, signal) => {
      this.exited = true;
      for (const cb of this.exitCallbacks) cb(code, signal);
      // Non-zero exit or signal = crash
      if (code !== 0 && code !== null) {
        for (const cb of this.crashCallbacks) cb(code, signal);
      } else if (signal !== null) {
        for (const cb of this.crashCallbacks) cb(code, signal);
      }
    });

    proc.on("error", (_err) => {
      if (!this.exited) {
        this.exited = true;
        for (const cb of this.exitCallbacks) cb(null, null);
        for (const cb of this.crashCallbacks) cb(null, null);
      }
    });
  }

  get stdin(): Writable {
    return this.proc.stdin!;
  }

  get stdout(): Readable {
    return this.proc.stdout!;
  }

  get stderr(): Readable {
    return this.proc.stderr!;
  }

  get pid(): number | undefined {
    return this.proc.pid;
  }

  get hasExited(): boolean {
    return this.exited;
  }

  onCrash(callback: CrashCallback): void {
    this.crashCallbacks.push(callback);
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  /**
   * Send SIGTERM, then force-kill after timeout.
   */
  async kill(timeoutMs = 5000): Promise<void> {
    if (this.exited) return;

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!this.exited) {
          this.proc.kill("SIGKILL");
        }
        resolve();
      }, timeoutMs);

      this.proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      this.proc.kill("SIGTERM");
    });
  }
}

/**
 * Spawn an LSP server child process.
 */
export function spawnLSPServer(languageId: string, config: LanguageServerConfig): LSPProcessHandle {
  const proc = spawn(config.command, config.args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: config.rootDir,
    env: config.env ? { ...process.env, ...config.env } : process.env,
  });

  return new LSPProcessHandle(proc, languageId);
}

/**
 * Tracks restart attempts to enforce exponential backoff
 * and max-restarts-in-window limits.
 */
export class RestartTracker {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxRestarts: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if another restart is allowed within the window. */
  canRestart(): boolean {
    this.pruneOld();
    return this.timestamps.length < this.maxRestarts;
  }

  /** Record a restart attempt. */
  recordRestart(): void {
    this.timestamps.push(Date.now());
  }

  /** Get delay in ms for the next restart (exponential backoff). */
  getBackoffMs(): number {
    this.pruneOld();
    const attempt = this.timestamps.length;
    // 1s, 2s, 4s, 8s... capped at 30s
    return Math.min(1000 * 2 ** attempt, 30_000);
  }

  /** Reset the tracker (e.g., after successful initialization). */
  reset(): void {
    this.timestamps.length = 0;
  }

  private pruneOld(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
  }
}
