/**
 * @templar/artifact-client
 *
 * Create, discover, and spawn persistent artifacts for Templar agents.
 *
 * This package provides:
 * - ArtifactClient: High-level client with timeouts, fallback, and Resolver interface
 * - InMemoryArtifactStore: LRU-based fallback store for local/testing use
 * - prepareManifest(): Freeze an agent artifact into an immutable engine manifest
 *
 * @example
 * ```typescript
 * import { ArtifactClient, prepareManifest } from '@templar/artifact-client';
 *
 * const client = new ArtifactClient(nexusClient);
 *
 * // Discover available artifacts (metadata only)
 * const artifacts = await client.discover();
 *
 * // Load full artifact and prepare manifest for engine
 * const artifact = await client.load('art-123');
 * const manifest = prepareManifest({ artifact });
 * ```
 */

export { ArtifactClient } from "./client.js";
export { InMemoryArtifactStore } from "./in-memory-store.js";
export { prepareManifest } from "./prepare-manifest.js";
export type {
  ArtifactClientConfig,
  ArtifactMetadata,
  ArtifactStatus,
  ArtifactType,
  PreparedManifest,
  PrepareManifestParams,
  ResolvedArtifactClientConfig,
  StoredArtifact,
} from "./types.js";
