/**
 * Safe binary registry — frozen ReadonlySet for O(1) lookup.
 */

import { DEFAULT_SAFE_BINARIES } from "./constants.js";

/**
 * Creates a frozen registry of safe binaries from config.
 */
export function createRegistry(
  additionalBinaries: readonly string[],
  removeBinaries: readonly string[],
): ReadonlySet<string> {
  const removeSet = new Set(removeBinaries);
  const binaries = new Set<string>();

  for (const binary of DEFAULT_SAFE_BINARIES) {
    if (!removeSet.has(binary)) {
      binaries.add(binary);
    }
  }

  for (const binary of additionalBinaries) {
    binaries.add(binary);
  }

  return Object.freeze(binaries);
}

/**
 * Checks if a binary is in the safe registry.
 */
export function isSafeBinary(registry: ReadonlySet<string>, binary: string): boolean {
  return registry.has(binary);
}
