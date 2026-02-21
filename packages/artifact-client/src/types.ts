/**
 * Configuration and internal types for @templar/artifact-client
 */

import type { Artifact, ArtifactMetadata, ArtifactStatus, ArtifactType } from "@nexus/sdk";

/**
 * Callback invoked when the client degrades to fallback mode.
 *
 * @param operation - The operation that triggered degradation (e.g. "artifact.load")
 * @param error - The original error from Nexus
 */
export type DegradationCallback = (operation: string, error: Error) => void;

/**
 * Configuration for the artifact client
 */
export interface ArtifactClientConfig {
  /** Operation timeout for search queries (ms). Default: 5000 */
  readonly searchTimeoutMs?: number;
  /** Operation timeout for create/update/delete (ms). Default: 10000 */
  readonly mutationTimeoutMs?: number;
  /** Enable InMemoryArtifactStore fallback when Nexus is unavailable. Default: true */
  readonly fallbackEnabled?: boolean;
  /** Maximum capacity for the in-memory LRU store. Default: 1000 */
  readonly inMemoryCapacity?: number;
  /** Default page size for list/discover operations. Default: 100 */
  readonly defaultPageSize?: number;
  /** Called when the client falls back to in-memory store due to Nexus unavailability */
  readonly onDegradation?: DegradationCallback;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedArtifactClientConfig {
  readonly searchTimeoutMs: number;
  readonly mutationTimeoutMs: number;
  readonly fallbackEnabled: boolean;
  readonly inMemoryCapacity: number;
  readonly defaultPageSize: number;
  readonly onDegradation: DegradationCallback | undefined;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<ResolvedArtifactClientConfig, "onDegradation"> = {
  searchTimeoutMs: 5_000,
  mutationTimeoutMs: 10_000,
  fallbackEnabled: true,
  inMemoryCapacity: 1_000,
  defaultPageSize: 100,
} as const;

/**
 * Stored artifact entry in the in-memory store (metadata + full artifact)
 */
export interface StoredArtifact {
  readonly metadata: ArtifactMetadata;
  readonly artifact: Artifact;
}

/**
 * Parameters for preparing an agent manifest from artifact
 */
export interface PrepareManifestParams {
  /** The agent artifact to prepare a manifest from */
  readonly artifact: Artifact;
  /** Optional override values to merge into the manifest */
  readonly overrides?: Readonly<Record<string, unknown>>;
}

/**
 * Result from prepareManifest — a frozen, ready-to-use manifest
 */
export interface PreparedManifest {
  /** The original artifact ID */
  readonly artifactId: string;
  /** The artifact version used */
  readonly version: number;
  /** The frozen manifest object */
  readonly manifest: Readonly<Record<string, unknown>>;
}

/**
 * Re-export SDK types for convenience
 */
export type { Artifact, ArtifactMetadata, ArtifactStatus, ArtifactType };
