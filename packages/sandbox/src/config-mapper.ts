import type { SandboxConfig } from "./types.js";

/**
 * SandboxRuntimeConfig shape expected by @anthropic-ai/sandbox-runtime.
 * We define it here rather than importing to keep the mapping explicit.
 */
export interface SrtConfig {
  readonly network: {
    readonly allowedDomains: readonly string[];
    readonly deniedDomains?: readonly string[];
    readonly allowLocalBinding?: boolean;
    readonly allowUnixSockets?: readonly string[];
  };
  readonly filesystem: {
    readonly denyRead: readonly string[];
    readonly allowWrite: readonly string[];
    readonly denyWrite?: readonly string[];
  };
  readonly ignoreViolations?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Map a Templar SandboxConfig to the shape expected by @anthropic-ai/sandbox-runtime.
 * Pure function — no side effects, no mutations.
 */
export function mapToSrtConfig(config: SandboxConfig): SrtConfig {
  return {
    network: {
      allowedDomains: config.network.allowedDomains,
      ...(config.network.deniedDomains ? { deniedDomains: config.network.deniedDomains } : {}),
      ...(config.network.allowLocalBinding !== undefined
        ? { allowLocalBinding: config.network.allowLocalBinding }
        : {}),
      ...(config.network.allowUnixSockets
        ? { allowUnixSockets: config.network.allowUnixSockets }
        : {}),
    },
    filesystem: {
      denyRead: config.filesystem.denyRead,
      allowWrite: config.filesystem.allowWrite,
      ...(config.filesystem.denyWrite ? { denyWrite: config.filesystem.denyWrite } : {}),
    },
    ...(config.ignoreViolations ? { ignoreViolations: config.ignoreViolations } : {}),
  };
}

/**
 * Merge a partial config override into a base config (immutably).
 */
export function mergeConfigs(
  base: SandboxConfig,
  overrides: Partial<SandboxConfig>,
): SandboxConfig {
  return {
    network: {
      ...base.network,
      ...(overrides.network ?? {}),
    },
    filesystem: {
      ...base.filesystem,
      ...(overrides.filesystem ?? {}),
    },
    ...(overrides.allowedCommands
      ? { allowedCommands: overrides.allowedCommands }
      : base.allowedCommands
        ? { allowedCommands: base.allowedCommands }
        : {}),
    ...(overrides.resourceLimits
      ? { resourceLimits: overrides.resourceLimits }
      : base.resourceLimits
        ? { resourceLimits: base.resourceLimits }
        : {}),
    ...(overrides.ignoreViolations
      ? { ignoreViolations: overrides.ignoreViolations }
      : base.ignoreViolations
        ? { ignoreViolations: base.ignoreViolations }
        : {}),
  };
}
