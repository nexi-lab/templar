/**
 * Edge sync configuration resolution.
 *
 * Merges user-provided overrides with defaults and validates constraints.
 */

import type { EdgeSyncConfig } from "@templar/core";
import { FederationConfigurationInvalidError } from "@templar/errors";
import { DEFAULT_EDGE_SYNC_CONFIG } from "./constants.js";

/**
 * Resolve edge sync config by merging user overrides with defaults.
 *
 * @throws {FederationConfigurationInvalidError} if any value is non-positive.
 */
export function resolveEdgeSyncConfig(overrides?: EdgeSyncConfig): Required<EdgeSyncConfig> {
  const resolved: Required<EdgeSyncConfig> = {
    ...DEFAULT_EDGE_SYNC_CONFIG,
    ...overrides,
  };

  const fields: (keyof EdgeSyncConfig)[] = [
    "maxReconnectAttempts",
    "reconnectBaseDelayMs",
    "reconnectMaxDelayMs",
    "authRefreshTimeoutMs",
    "conflictScanTimeoutMs",
    "walReplayTimeoutMs",
  ];

  for (const field of fields) {
    const value = resolved[field];
    if (value <= 0 || !Number.isFinite(value)) {
      throw new FederationConfigurationInvalidError(
        `${field} must be a positive finite number, got ${String(value)}`,
      );
    }
  }

  return resolved;
}
