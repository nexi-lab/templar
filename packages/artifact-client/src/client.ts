/**
 * ArtifactClient — main entry point for artifact operations.
 *
 * Wraps the NexusClient's ArtifactsResource with:
 * - Operation-specific timeouts (5s search, 10s mutations)
 * - Graceful degradation to InMemoryArtifactStore when Nexus is unavailable
 * - Progressive disclosure via the Resolver<ArtifactMetadata, Artifact> interface
 */

import type {
  Artifact,
  ArtifactMetadata,
  CreateArtifactParams,
  ListArtifactsParams,
  NexusClient,
  SearchArtifactsParams,
  UpdateArtifactParams,
} from "@nexus/sdk";
import type { Resolver } from "@templar/core";
import {
  ArtifactNotFoundError,
  ArtifactSearchFailedError,
  ArtifactStoreUnavailableError,
} from "@templar/errors";
import { InMemoryArtifactStore } from "./in-memory-store.js";
import {
  type ArtifactClientConfig,
  DEFAULT_CONFIG,
  type ResolvedArtifactClientConfig,
} from "./types.js";

/**
 * Race a promise against a timeout. Rejects with a descriptive error on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * ArtifactClient provides a high-level interface for managing persistent artifacts.
 *
 * It implements the Resolver interface for integration with the engine's
 * progressive disclosure pattern, and adds CRUD + search capabilities.
 *
 * @example
 * ```typescript
 * const client = new ArtifactClient(nexusClient);
 *
 * // Discover available artifacts (metadata only)
 * const artifacts = await client.discover();
 *
 * // Load a full artifact on demand
 * const full = await client.load('art-123');
 *
 * // Search by natural language
 * const results = await client.search({ query: 'refund calculator' });
 * ```
 */
export class ArtifactClient implements Resolver<ArtifactMetadata, Artifact> {
  readonly name = "nexus-artifact";

  private readonly nexus: NexusClient;
  private readonly config: ResolvedArtifactClientConfig;
  private readonly fallbackStore: InMemoryArtifactStore | null;

  constructor(nexus: NexusClient, config?: ArtifactClientConfig) {
    if (config?.searchTimeoutMs !== undefined && config.searchTimeoutMs <= 0) {
      throw new Error("searchTimeoutMs must be positive");
    }
    if (config?.mutationTimeoutMs !== undefined && config.mutationTimeoutMs <= 0) {
      throw new Error("mutationTimeoutMs must be positive");
    }
    if (config?.inMemoryCapacity !== undefined && config.inMemoryCapacity < 1) {
      throw new Error("inMemoryCapacity must be at least 1");
    }

    this.nexus = nexus;
    this.config = {
      searchTimeoutMs: config?.searchTimeoutMs ?? DEFAULT_CONFIG.searchTimeoutMs,
      mutationTimeoutMs: config?.mutationTimeoutMs ?? DEFAULT_CONFIG.mutationTimeoutMs,
      fallbackEnabled: config?.fallbackEnabled ?? DEFAULT_CONFIG.fallbackEnabled,
      inMemoryCapacity: config?.inMemoryCapacity ?? DEFAULT_CONFIG.inMemoryCapacity,
    };
    this.fallbackStore = this.config.fallbackEnabled
      ? new InMemoryArtifactStore(this.config.inMemoryCapacity)
      : null;
  }

  /**
   * Discover all available artifacts, returning metadata only.
   *
   * Falls back to in-memory store if Nexus API is unavailable.
   */
  async discover(): Promise<readonly ArtifactMetadata[]> {
    try {
      const response = await withTimeout(
        this.nexus.artifacts.list(),
        this.config.searchTimeoutMs,
        "artifact.discover",
      );
      return response.data;
    } catch (error) {
      if (this.fallbackStore) {
        return this.fallbackStore.discover();
      }
      throw new ArtifactStoreUnavailableError(
        "Failed to discover artifacts",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Load a specific artifact's full content by ID.
   *
   * Falls back to in-memory store if Nexus API is unavailable.
   */
  async load(id: string): Promise<Artifact | undefined> {
    try {
      const artifact = await withTimeout(
        this.nexus.artifacts.get(id),
        this.config.searchTimeoutMs,
        "artifact.load",
      );
      return artifact;
    } catch (_error) {
      if (this.fallbackStore) {
        return this.fallbackStore.load(id);
      }
      return undefined;
    }
  }

  /**
   * Create a new artifact.
   *
   * @throws ArtifactStoreUnavailableError if Nexus is unreachable and no fallback
   */
  async create(params: CreateArtifactParams): Promise<Artifact> {
    try {
      return await withTimeout(
        this.nexus.artifacts.create(params),
        this.config.mutationTimeoutMs,
        "artifact.create",
      );
    } catch (error) {
      if (this.fallbackStore) {
        return this.fallbackStore.create(params);
      }
      throw new ArtifactStoreUnavailableError(
        "Failed to create artifact",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an existing artifact.
   *
   * @throws ArtifactNotFoundError if the artifact does not exist
   * @throws ArtifactVersionConflictError if expectedVersion does not match
   * @throws ArtifactStoreUnavailableError if Nexus is unreachable and no fallback
   */
  async update(id: string, params: UpdateArtifactParams): Promise<Artifact> {
    try {
      return await withTimeout(
        this.nexus.artifacts.update(id, params),
        this.config.mutationTimeoutMs,
        "artifact.update",
      );
    } catch (error) {
      if (this.fallbackStore) {
        const result = await this.fallbackStore.update(id, params);
        if (!result) {
          throw new ArtifactNotFoundError(id);
        }
        return result;
      }
      throw new ArtifactStoreUnavailableError(
        `Failed to update artifact ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete an artifact by ID.
   *
   * @throws ArtifactStoreUnavailableError if Nexus is unreachable and no fallback
   */
  async delete(id: string): Promise<void> {
    try {
      await withTimeout(
        this.nexus.artifacts.delete(id),
        this.config.mutationTimeoutMs,
        "artifact.delete",
      );
    } catch (error) {
      if (this.fallbackStore) {
        await this.fallbackStore.delete(id);
        return;
      }
      throw new ArtifactStoreUnavailableError(
        `Failed to delete artifact ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * List artifacts with optional filtering.
   *
   * @throws ArtifactStoreUnavailableError if Nexus is unreachable and no fallback
   */
  async list(params?: ListArtifactsParams): Promise<readonly ArtifactMetadata[]> {
    try {
      const response = await withTimeout(
        this.nexus.artifacts.list(params),
        this.config.searchTimeoutMs,
        "artifact.list",
      );
      return response.data;
    } catch (error) {
      if (this.fallbackStore) {
        return this.fallbackStore.list(params);
      }
      throw new ArtifactStoreUnavailableError(
        "Failed to list artifacts",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Search artifacts using semantic or keyword search.
   *
   * @throws ArtifactSearchFailedError if the search operation fails
   */
  async search(
    params: SearchArtifactsParams,
  ): Promise<readonly { artifact: ArtifactMetadata; score: number }[]> {
    try {
      const response = await withTimeout(
        this.nexus.artifacts.search(params),
        this.config.searchTimeoutMs,
        "artifact.search",
      );
      return response.results;
    } catch (error) {
      if (this.fallbackStore) {
        const results = await this.fallbackStore.search(params.query);
        return results.map((r) => ({ artifact: r.metadata, score: r.score }));
      }
      throw new ArtifactSearchFailedError(params.query, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Load multiple artifacts by ID in a single batch request.
   *
   * Falls back to sequential loads via in-memory store if Nexus is unavailable.
   */
  async getBatch(ids: readonly string[]): Promise<readonly Artifact[]> {
    try {
      const response = await withTimeout(
        this.nexus.artifacts.getBatch({ ids }),
        this.config.searchTimeoutMs,
        "artifact.getBatch",
      );
      return response.artifacts;
    } catch (error) {
      if (this.fallbackStore) {
        const results: Artifact[] = [];
        for (const id of ids) {
          const artifact = await this.fallbackStore.load(id);
          if (artifact) results.push(artifact);
        }
        return results;
      }
      throw new ArtifactStoreUnavailableError(
        "Failed to batch load artifacts",
        error instanceof Error ? error : undefined,
      );
    }
  }
}
