/**
 * prepareManifest — converts an AgentArtifact into a frozen, ready-to-use manifest.
 *
 * This is the "spawn" half of the artifact lifecycle:
 * 1. discover() → list available artifacts
 * 2. load() → fetch full artifact content
 * 3. prepareManifest() → freeze into an immutable manifest for engine consumption
 *
 * Only agent-type artifacts can be prepared into manifests.
 */

import type { Artifact } from "@nexus/sdk";
import { ArtifactInvalidTypeError } from "@templar/errors";
import type { PreparedManifest, PrepareManifestParams } from "./types.js";

/**
 * Deep-freeze an object and all nested objects.
 * Returns the same object reference (frozen in place) for performance.
 */
function deepFreeze<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return Object.freeze(obj);
}

/**
 * Prepare an agent artifact's manifest for engine consumption.
 *
 * - Validates the artifact is of type "agent"
 * - Merges optional overrides into the manifest (shallow merge — top-level keys
 *   from overrides replace corresponding keys in the manifest entirely)
 * - Deep-freezes the result to prevent accidental mutation
 *
 * @param params - The artifact and optional overrides
 * @returns A frozen, versioned manifest ready for the engine
 * @throws ArtifactInvalidTypeError if artifact is not type "agent"
 */
export function prepareManifest(params: PrepareManifestParams): PreparedManifest {
  const { artifact, overrides } = params;

  if (artifact.type !== "agent") {
    throw new ArtifactInvalidTypeError(artifact.type);
  }

  const agentArtifact = artifact as Extract<Artifact, { type: "agent" }>;

  const merged: Record<string, unknown> = overrides
    ? { ...agentArtifact.manifest, ...overrides }
    : { ...agentArtifact.manifest };

  return {
    artifactId: artifact.id,
    version: artifact.version,
    manifest: deepFreeze(merged),
  };
}
