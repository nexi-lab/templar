import type { SandboxConfig, SandboxProfile } from "./types.js";

/**
 * Default restrictive config: no network, no writes, deny sensitive reads.
 */
const RESTRICTIVE_CONFIG: SandboxConfig = {
  network: {
    allowedDomains: ["localhost"],
  },
  filesystem: {
    denyRead: ["~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud", "/etc/shadow", "/etc/passwd"],
    allowWrite: [],
  },
};

/**
 * Default permissive config: broad access with basic protections.
 * Denies secrets but allows /tmp writes and common network access.
 */
const PERMISSIVE_CONFIG: SandboxConfig = {
  network: {
    allowedDomains: ["*"],
  },
  filesystem: {
    denyRead: ["~/.ssh", "~/.gnupg", "~/.aws", "/etc/shadow"],
    allowWrite: ["/tmp", "/var/tmp"],
  },
};

/**
 * Create a SandboxConfig from a named security profile.
 *
 * - `restrictive`: Minimal access (localhost-only network, no writes, deny sensitive reads).
 * - `permissive`: Broad access with basic protections (deny secrets, allow /tmp writes).
 * - `custom`: Returns the overrides as-is — caller provides the full config.
 *
 * @param profile - The security profile preset to use.
 * @param overrides - Optional partial config merged on top of the profile defaults.
 *                    For `custom`, overrides must include all required fields.
 */
export function createSandboxConfig(
  profile: SandboxProfile,
  overrides?: Partial<SandboxConfig>,
): SandboxConfig {
  const base = getProfileBase(profile, overrides);

  if (!overrides || profile === "custom") {
    return base;
  }

  return {
    network: {
      ...base.network,
      ...(overrides.network ?? {}),
    },
    filesystem: {
      ...base.filesystem,
      ...(overrides.filesystem ?? {}),
    },
    ...(overrides.allowedCommands ? { allowedCommands: overrides.allowedCommands } : {}),
    ...(overrides.resourceLimits ? { resourceLimits: overrides.resourceLimits } : {}),
    ...(overrides.ignoreViolations
      ? { ignoreViolations: overrides.ignoreViolations }
      : base.ignoreViolations
        ? { ignoreViolations: base.ignoreViolations }
        : {}),
  };
}

function getProfileBase(
  profile: SandboxProfile,
  overrides?: Partial<SandboxConfig>,
): SandboxConfig {
  switch (profile) {
    case "restrictive":
      return RESTRICTIVE_CONFIG;
    case "permissive":
      return PERMISSIVE_CONFIG;
    case "custom": {
      if (!overrides?.network || !overrides?.filesystem) {
        throw new Error('Profile "custom" requires overrides with network and filesystem fields');
      }
      return overrides as SandboxConfig;
    }
  }
}
