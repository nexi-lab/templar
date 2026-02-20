import { spawn } from "node:child_process";
import { buildEnvVars, tryGetContext } from "@templar/core";
import {
  ExternalError,
  InternalError,
  PermissionError,
  TimeoutError,
  ValidationError,
} from "@templar/errors";
import type { ZodError } from "zod";
import { mapToSrtConfig, mergeConfigs } from "./config-mapper.js";
import { checkPlatformDependencies, detectPlatform } from "./platform.js";
import type {
  SandboxConfig,
  SandboxDependencyReport,
  SandboxExecOptions,
  SandboxExecResult,
} from "./types.js";
import { validateExecOptions, validateSandboxConfig } from "./validation.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MB
const SIGKILL_GRACE_MS = 5_000;

/**
 * OS-level sandbox for executing commands with filesystem and network restrictions.
 * Wraps @anthropic-ai/sandbox-runtime (macOS Seatbelt / Linux bubblewrap).
 *
 * Lifecycle: lazy init on first exec(), kept alive until dispose().
 */
export class TemplarSandbox implements AsyncDisposable {
  private readonly config: Readonly<SandboxConfig>;
  private initialized = false;
  private srtManager: SandboxManagerLike | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SandboxConfig) {
    try {
      this.config = validateSandboxConfig(config);
    } catch (error) {
      throw new ValidationError({
        code: "SANDBOX_CONFIG_INVALID",
        message: formatZodMessage(error),
        ...(error instanceof Error ? { cause: error } : {}),
      });
    }
  }

  /**
   * Execute a command inside the sandbox.
   * Lazy-initializes the sandbox runtime on first call.
   */
  async exec(options: SandboxExecOptions): Promise<SandboxExecResult> {
    // Validate options
    try {
      validateExecOptions(options);
    } catch (error) {
      throw new ValidationError({
        code: "SANDBOX_CONFIG_INVALID",
        message: formatZodMessage(error),
        ...(error instanceof Error ? { cause: error } : {}),
      });
    }

    // Resolve effective config (base + per-call overrides)
    const effectiveConfig = options.configOverrides
      ? mergeConfigs(this.config, options.configOverrides)
      : this.config;

    // Enforce allowedCommands allowlist
    if (effectiveConfig.allowedCommands) {
      enforceAllowedCommands(options.command, effectiveConfig.allowedCommands);
    }

    // Lazy init with promise-based lock to prevent concurrent initialization
    if (!this.initialized) {
      if (!this.initPromise) {
        this.initPromise = this.initialize();
      }
      await this.initPromise;
    }

    // Build the command string
    const commandStr = buildCommandString(options.command, options.args ?? []);

    // Wrap with sandbox (manager is guaranteed non-null after initialize)
    const manager = this.srtManager;
    if (!manager) {
      throw new InternalError({
        code: "SANDBOX_EXEC_FAILED",
        message: "Sandbox manager not initialized",
      });
    }
    let wrappedCommand: string;
    try {
      wrappedCommand = await manager.wrapWithSandbox(commandStr);
    } catch (error) {
      throw new InternalError({
        code: "SANDBOX_EXEC_FAILED",
        message: `Failed to wrap command with sandbox: ${error instanceof Error ? error.message : String(error)}`,
        ...(error instanceof Error ? { cause: error } : {}),
      });
    }

    // Timeout priority: per-call timeoutMs > resourceLimits.timeoutSeconds > default
    const timeoutMs =
      options.timeoutMs ??
      (effectiveConfig.resourceLimits?.timeoutSeconds
        ? effectiveConfig.resourceLimits.timeoutSeconds * 1000
        : DEFAULT_TIMEOUT_MS);
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    // Apply resource limits (memory via ulimit, CPU is best-effort)
    const finalCommand = applyResourceLimits(wrappedCommand, effectiveConfig.resourceLimits);

    return this.spawnSandboxed(finalCommand, commandStr, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {}),
      timeoutMs,
      maxOutputBytes,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }

  /**
   * Check if sandboxing is available on this platform (non-throwing).
   */
  static isAvailable(): boolean {
    return checkPlatformDependencies().available;
  }

  /**
   * Check dependencies with detailed diagnostics.
   */
  static checkDependencies(): SandboxDependencyReport {
    return checkPlatformDependencies();
  }

  /**
   * Clean up: stop proxy, clear state.
   */
  async dispose(): Promise<void> {
    if (this.srtManager && this.initialized) {
      try {
        await this.srtManager.reset();
      } catch {
        // Best-effort cleanup
      }
    }
    this.initialized = false;
    this.srtManager = null;
    this.initPromise = null;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Platform check (throws on unsupported)
    detectPlatform();

    const srtConfig = mapToSrtConfig(this.config);

    try {
      const srt = await import("@anthropic-ai/sandbox-runtime");
      this.srtManager = srt.SandboxManager as unknown as SandboxManagerLike;
      await this.srtManager.initialize(srtConfig);
      this.initialized = true;
    } catch (error) {
      // Cleanup partially-initialized state
      if (this.srtManager) {
        try {
          await this.srtManager.reset();
        } catch {
          // Best-effort cleanup
        }
        this.srtManager = null;
      }
      this.initPromise = null;

      if (error instanceof ValidationError || error instanceof ExternalError) {
        throw error;
      }
      throw new ExternalError({
        code: "SANDBOX_UNAVAILABLE",
        message: `Failed to initialize sandbox runtime: ${error instanceof Error ? error.message : String(error)}`,
        ...(error instanceof Error ? { cause: error } : {}),
      });
    }
  }

  private async spawnSandboxed(
    wrappedCommand: string,
    originalCommand: string,
    opts: {
      cwd?: string;
      env?: Readonly<Record<string, string>>;
      timeoutMs: number;
      maxOutputBytes: number;
      signal?: AbortSignal;
    },
  ): Promise<SandboxExecResult> {
    const start = performance.now();

    // Compose abort signals: timeout + caller signal
    const timeoutSignal = AbortSignal.timeout(opts.timeoutMs);
    const combinedSignal = opts.signal
      ? AbortSignal.any([timeoutSignal, opts.signal])
      : timeoutSignal;

    return new Promise<SandboxExecResult>((resolve, reject) => {
      // Build env: process.env < TEMPLAR_* context vars < explicit opts.env
      // Context vars are injected automatically when an active session exists (#128)
      const runtimeCtx = tryGetContext();
      const contextVars = runtimeCtx !== undefined ? buildEnvVars(runtimeCtx) : {};
      const hasContextOrExplicitEnv = Object.keys(contextVars).length > 0 || opts.env !== undefined;
      const child = spawn(wrappedCommand, {
        shell: true,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        ...(hasContextOrExplicitEnv
          ? { env: { ...process.env, ...contextVars, ...opts.env } }
          : {}),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;
      let killed = false;
      let resultSignal: NodeJS.Signals | null = null;

      const maxPerStream = opts.maxOutputBytes;

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutBytes < maxPerStream) {
          const remaining = maxPerStream - stdoutBytes;
          stdout += chunk.subarray(0, remaining).toString("utf-8");
        }
        stdoutBytes += chunk.length;
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBytes < maxPerStream) {
          const remaining = maxPerStream - stderrBytes;
          stderr += chunk.subarray(0, remaining).toString("utf-8");
        }
        stderrBytes += chunk.length;
      });

      const onAbort = () => {
        if (killed) return;
        killed = true;
        timedOut = timeoutSignal.aborted;

        // SIGTERM first
        child.kill("SIGTERM");

        // SIGKILL after grace period
        const killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, SIGKILL_GRACE_MS);
        killTimer.unref();
      };

      combinedSignal.addEventListener("abort", onAbort, { once: true });

      child.on("error", (error) => {
        combinedSignal.removeEventListener("abort", onAbort);
        reject(
          new InternalError({
            code: "SANDBOX_EXEC_FAILED",
            message: `Sandboxed process failed to start: ${error.message}`,
            cause: error,
          }),
        );
      });

      child.on("close", (exitCode, signal) => {
        combinedSignal.removeEventListener("abort", onAbort);
        resultSignal = signal ?? null;
        const durationMs = Math.round(performance.now() - start);

        // Annotate stderr with sandbox failures if available
        const annotatedStderr = this.annotateStderr(originalCommand, stderr);

        const result: SandboxExecResult = {
          exitCode: exitCode ?? null,
          stdout,
          stderr: annotatedStderr,
          timedOut,
          signal: resultSignal,
          durationMs,
        };

        if (timedOut) {
          reject(
            new TimeoutError({
              code: "SANDBOX_EXEC_TIMEOUT",
              message: `Command timed out after ${opts.timeoutMs}ms`,
            }),
          );
          return;
        }

        // Check for policy violations in stderr
        if (
          annotatedStderr.includes("[sandbox violation]") ||
          annotatedStderr.includes("sandbox policy violation")
        ) {
          reject(
            new PermissionError({
              code: "SANDBOX_POLICY_VIOLATION",
              message: `Sandbox policy violation detected: ${annotatedStderr.slice(0, 500)}`,
            }),
          );
          return;
        }

        resolve(result);
      });
    });
  }

  private annotateStderr(command: string, stderr: string): string {
    if (!this.srtManager) return stderr;
    try {
      return this.srtManager.annotateStderrWithSandboxFailures(command, stderr);
    } catch {
      return stderr;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type-safe interface for the SandboxManager methods we use.
 * Avoids importing srt types at the module level.
 */
interface SandboxManagerLike {
  initialize(config: unknown): Promise<void>;
  wrapWithSandbox(command: string): Promise<string>;
  reset(): Promise<void>;
  annotateStderrWithSandboxFailures(command: string, stderr: string): string;
}

/**
 * Build a shell-safe command string from command + args.
 */
function buildCommandString(command: string, args: readonly string[]): string {
  if (args.length === 0) return command;
  const quotedArgs = args.map((arg) => shellQuote(arg));
  return `${command} ${quotedArgs.join(" ")}`;
}

/**
 * Simple shell quoting: wrap in single quotes, escape existing single quotes.
 */
function shellQuote(arg: string): string {
  if (arg === "") return "''";
  // If the arg contains no special characters, return as-is
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(arg)) return arg;
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Format a ZodError or generic error into a human-readable message.
 */
function formatZodMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const zodError = error as ZodError;
    return zodError.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Enforce the allowedCommands allowlist. Throws SANDBOX_POLICY_VIOLATION
 * if the command name/path is not in the list.
 */
function enforceAllowedCommands(command: string, allowedCommands: readonly string[]): void {
  // Reject shell metacharacters that could enable command injection
  if (SHELL_METACHAR_RE.test(command)) {
    throw new PermissionError({
      code: "SANDBOX_POLICY_VIOLATION",
      message: `Command contains shell metacharacters: "${command}"`,
    });
  }

  // Extract the command name (first token, or basename of a path)
  const commandName = command.split("/").pop()?.split(/\s/)[0] ?? command;
  const isAllowed = allowedCommands.some(
    (allowed) => allowed === command || allowed === commandName,
  );
  if (!isAllowed) {
    throw new PermissionError({
      code: "SANDBOX_POLICY_VIOLATION",
      message: `Command "${command}" is not in the allowed commands list: [${allowedCommands.join(", ")}]`,
    });
  }
}

const SHELL_METACHAR_RE = /[;&|`$()<>{}[\]\\]/;

/**
 * Apply resource limits to a command by wrapping with ulimit/nice.
 * - maxMemoryMB: enforced via `ulimit -v` (virtual memory limit in KB)
 * - maxCPUPercent: best-effort via `nice` (lower priority for <50%)
 */
function applyResourceLimits(
  command: string,
  resourceLimits?: SandboxConfig["resourceLimits"],
): string {
  if (!resourceLimits) return command;

  const prefixes: string[] = [];

  if (resourceLimits.maxMemoryMB) {
    const memoryKB = resourceLimits.maxMemoryMB * 1024;
    prefixes.push(`ulimit -v ${memoryKB}`);
  }

  if (resourceLimits.maxCPUPercent && resourceLimits.maxCPUPercent < 50) {
    // nice -n 10 reduces priority; best-effort CPU limiting
    prefixes.push("nice -n 10");
  }

  if (prefixes.length === 0) return command;

  // Use ulimit in a subshell if present, nice as a prefix
  const hasUlimit = prefixes.some((p) => p.startsWith("ulimit"));
  const nicePrefix = prefixes.find((p) => p.startsWith("nice"));

  // Escape single quotes in command to prevent injection when wrapping in sh -c '...'
  const escapedCommand = command.replace(/'/g, "'\\''");

  if (hasUlimit && nicePrefix) {
    const ulimitCmd = prefixes.find((p) => p.startsWith("ulimit"));
    return `sh -c '${ulimitCmd} && ${nicePrefix} ${escapedCommand}'`;
  }
  if (hasUlimit) {
    const ulimitCmd = prefixes.find((p) => p.startsWith("ulimit"));
    return `sh -c '${ulimitCmd} && ${escapedCommand}'`;
  }
  if (nicePrefix) {
    return `${nicePrefix} ${command}`;
  }

  return command;
}
