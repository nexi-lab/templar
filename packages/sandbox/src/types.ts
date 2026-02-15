/**
 * Templar-native sandbox types.
 *
 * These types are the public API surface. Internally they map to
 * @anthropic-ai/sandbox-runtime's SandboxRuntimeConfig via config-mapper.
 */

/**
 * Network access control configuration.
 * Default: all network access denied unless explicitly permitted.
 */
export interface SandboxNetworkConfig {
  /** Domains the sandboxed process is allowed to reach (supports wildcards: `*.example.com`). */
  readonly allowedDomains: readonly string[];
  /** Domains explicitly blocked — takes precedence over allowedDomains. */
  readonly deniedDomains?: readonly string[];
  /** Allow the sandboxed process to bind to localhost ports. */
  readonly allowLocalBinding?: boolean;
  /** Specific Unix socket paths the process may access. */
  readonly allowUnixSockets?: readonly string[];
}

/**
 * Filesystem access control configuration.
 * Reads are deny-list based (everything allowed unless denied).
 * Writes are allow-list based (nothing allowed unless permitted).
 */
export interface SandboxFilesystemConfig {
  /** Paths to deny reading. */
  readonly denyRead: readonly string[];
  /** Paths to allow writing. */
  readonly allowWrite: readonly string[];
  /** Exceptions within allowed write paths — takes precedence. */
  readonly denyWrite?: readonly string[];
}

/**
 * Resource limits for sandboxed processes.
 */
export interface SandboxResourceLimits {
  /** Maximum memory in megabytes. Enforced via ulimit. */
  readonly maxMemoryMB?: number;
  /** Maximum CPU percentage (1-100). Best-effort via nice/cpulimit. */
  readonly maxCPUPercent?: number;
  /** Timeout in seconds. Applied to each exec() call. */
  readonly timeoutSeconds?: number;
}

/**
 * Top-level sandbox configuration — Templar-native.
 */
export interface SandboxConfig {
  readonly network: SandboxNetworkConfig;
  readonly filesystem: SandboxFilesystemConfig;
  /** Allowed executable names/paths. If set, only listed commands can be executed. */
  readonly allowedCommands?: readonly string[];
  /** Resource limits for sandboxed processes. */
  readonly resourceLimits?: SandboxResourceLimits;
  /** Map of command patterns to paths where violations should be ignored. */
  readonly ignoreViolations?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Security profile preset.
 * - `restrictive`: Minimal access (no network, no writes, no sensitive reads).
 * - `permissive`: Broad access with basic protections (deny secrets, allow /tmp writes).
 * - `custom`: User-provided configuration — no defaults applied.
 */
export type SandboxProfile = "restrictive" | "permissive" | "custom";

/**
 * Per-call execution options.
 */
export interface SandboxExecOptions {
  /** The command to execute inside the sandbox. */
  readonly command: string;
  /** Arguments for the command. */
  readonly args?: readonly string[];
  /** Working directory for the command. */
  readonly cwd?: string;
  /** Environment variables for the command. */
  readonly env?: Readonly<Record<string, string>>;
  /** Timeout in milliseconds. Overrides resourceLimits.timeoutSeconds. Default: 30_000. */
  readonly timeoutMs?: number;
  /** Maximum stdout+stderr output size in bytes. Default: 1_048_576 (1 MB). */
  readonly maxOutputBytes?: number;
  /** Caller-provided abort signal. */
  readonly signal?: AbortSignal;
  /** Per-call sandbox config overrides merged with the base config. */
  readonly configOverrides?: Partial<SandboxConfig>;
}

/**
 * Immutable result of a sandboxed command execution.
 */
export interface SandboxExecResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
}

/**
 * Platform support status.
 */
export type SandboxPlatform = "macos" | "linux";

/**
 * Dependency check report returned by TemplarSandbox.checkDependencies().
 */
export interface SandboxDependencyReport {
  readonly available: boolean;
  readonly platform: SandboxPlatform | "unsupported";
  readonly details: string;
}
