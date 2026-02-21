/**
 * Merges a remote Nexus policy with local resolved config.
 *
 * Returns a new config — does not mutate the input.
 */

import type { ExecPolicyResponse } from "@nexus/sdk";
import { DANGEROUS_FLAG_PATTERNS } from "./constants.js";
import type { DangerousFlagPattern, ResolvedExecApprovalsConfig, RiskLevel } from "./types.js";

export function mergePolicy(
  local: ResolvedExecApprovalsConfig,
  remote: ExecPolicyResponse,
): ResolvedExecApprovalsConfig {
  // Merge safe binaries: add new ones, remove specified ones
  const mergedBinaries = new Set<string>(local.safeBinaries);
  for (const binary of remote.additional_safe_binaries) {
    mergedBinaries.add(binary);
  }
  for (const binary of remote.removed_safe_binaries) {
    mergedBinaries.delete(binary);
  }

  // The additional_never_allow patterns are appended to the NEVER_ALLOW check
  const additionalNeverAllow = remote.additional_never_allow;

  return {
    ...local,
    safeBinaries: Object.freeze(mergedBinaries),
    ...(remote.auto_promote_threshold !== null
      ? { autoPromoteThreshold: remote.auto_promote_threshold }
      : {}),
    ...(remote.max_patterns !== null ? { maxPatterns: remote.max_patterns } : {}),
    additionalNeverAllow: [...local.additionalNeverAllow, ...additionalNeverAllow],
  };
}

/**
 * Applies dangerous flag overrides from remote policy to the default patterns.
 *
 * @returns A new array of dangerous flag patterns with overrides applied.
 */
export function applyDangerousFlagOverrides(
  overrides: ExecPolicyResponse["dangerous_flag_overrides"],
): readonly DangerousFlagPattern[] {
  const patterns = [...DANGEROUS_FLAG_PATTERNS.map((p) => ({ ...p, flags: [...p.flags] }))];

  for (const override of overrides) {
    if (override.action === "add") {
      // Add a new pattern or merge flags into existing
      const existing = patterns.find((p) => p.binary === override.binary);
      if (existing) {
        for (const flag of override.flags) {
          if (!existing.flags.includes(flag)) {
            existing.flags.push(flag);
          }
        }
      } else {
        patterns.push({
          binary: override.binary,
          flags: [...override.flags],
          risk: override.risk as RiskLevel,
          reason: override.reason,
        });
      }
    } else if (override.action === "remove") {
      // Remove flags from existing pattern
      const existing = patterns.find((p) => p.binary === override.binary);
      if (existing) {
        const removeSet = new Set(override.flags);
        const filtered = existing.flags.filter((f) => !removeSet.has(f));
        existing.flags.length = 0;
        existing.flags.push(...filtered);
      }
    }
  }

  return patterns;
}
