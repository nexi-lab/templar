/**
 * @templar/sandbox
 *
 * OS-level agent sandboxing using macOS Seatbelt and Linux bubblewrap.
 * Wraps @anthropic-ai/sandbox-runtime to provide Templar-native types,
 * validation, and error handling for secure command execution.
 */

export { createSandboxConfig } from "./profiles.js";
export { TemplarSandbox } from "./sandbox.js";
export type {
  SandboxConfig,
  SandboxDependencyReport,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxFilesystemConfig,
  SandboxNetworkConfig,
  SandboxPlatform,
  SandboxProfile,
  SandboxResourceLimits,
} from "./types.js";
export { validateExecOptions, validateSandboxConfig } from "./validation.js";

export const PACKAGE_NAME = "@templar/sandbox" as const;
