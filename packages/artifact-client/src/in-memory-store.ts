/**
 * InMemoryArtifactStore — LRU-based in-memory fallback store
 *
 * Used when the Nexus API is unavailable, or for testing and local development.
 * Provides the same progressive disclosure pattern: discover() returns metadata,
 * load() returns full artifacts.
 *
 * Implements LRU eviction with a configurable capacity cap (default: 1000).
 */

import type {
  Artifact,
  ArtifactMetadata,
  ArtifactStatus,
  ArtifactType,
  CreateArtifactParams,
  UpdateArtifactParams,
} from "@nexus/sdk";
import type { Resolver } from "@templar/core";
import { ArtifactVersionConflictError } from "@templar/errors";
import { DEFAULT_CONFIG } from "./types.js";
import { validateCreateParams, validateUpdateParams } from "./validate.js";

/**
 * Internal mutable entry for tracking artifact state and LRU ordering
 */
interface StoreEntry {
  artifact: Artifact;
  metadata: ArtifactMetadata;
  lastAccessed: number;
}

/**
 * In-memory artifact store with LRU eviction.
 *
 * Implements the Resolver<ArtifactMetadata, Artifact> interface for
 * progressive disclosure. All mutations return new objects — the store
 * itself manages internal state but never exposes mutable references.
 */
export class InMemoryArtifactStore implements Resolver<ArtifactMetadata, Artifact> {
  readonly name = "in-memory";

  private readonly capacity: number;
  private readonly entries: Map<string, StoreEntry> = new Map();
  private nextId = 1;
  private accessCounter = 0;

  constructor(capacity?: number) {
    this.capacity = capacity ?? DEFAULT_CONFIG.inMemoryCapacity;
  }

  /**
   * Discover all stored artifacts, returning metadata only.
   * Results are ordered by most recently accessed first.
   */
  async discover(): Promise<readonly ArtifactMetadata[]> {
    const sorted = [...this.entries.values()].sort((a, b) => b.lastAccessed - a.lastAccessed);
    return sorted.map((e) => e.metadata);
  }

  /**
   * Load a specific artifact by ID.
   * Updates LRU access time on hit.
   */
  async load(id: string): Promise<Artifact | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    // Update LRU access time (replace entry immutably)
    this.entries.set(id, { ...entry, lastAccessed: ++this.accessCounter });
    return entry.artifact;
  }

  /**
   * Store a new artifact. Evicts least-recently-used if at capacity.
   * Returns the created artifact with generated ID and version.
   *
   * @throws ArtifactValidationFailedError if params are invalid
   */
  async create(params: CreateArtifactParams): Promise<Artifact> {
    validateCreateParams(params);
    this.evictIfNeeded();

    const id = `art-mem-${this.nextId++}`;
    const now = new Date().toISOString();

    const base = {
      id,
      name: params.name,
      description: params.description,
      type: params.type,
      tags: params.tags ? [...params.tags] : [],
      version: 1,
      status: "active" as const,
      createdBy: "local",
      createdAt: now,
      updatedAt: now,
    };

    const artifact: Artifact =
      params.type === "tool"
        ? { ...base, type: "tool" as const, schema: params.schema }
        : { ...base, type: "agent" as const, manifest: params.manifest };

    const metadata: ArtifactMetadata = {
      id,
      name: base.name,
      description: base.description,
      type: base.type,
      tags: base.tags,
      version: base.version,
      status: base.status,
      createdBy: base.createdBy,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };

    this.entries.set(id, {
      artifact,
      metadata,
      lastAccessed: ++this.accessCounter,
    });

    return artifact;
  }

  /**
   * Update an existing artifact. Supports optimistic concurrency via expectedVersion.
   * Returns the updated artifact or undefined if not found.
   *
   * @throws ArtifactValidationFailedError if params are invalid
   * @throws ArtifactVersionConflictError if expectedVersion does not match
   */
  async update(id: string, params: UpdateArtifactParams): Promise<Artifact | undefined> {
    validateUpdateParams(params);
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    if (params.expectedVersion !== undefined && params.expectedVersion !== entry.artifact.version) {
      throw new ArtifactVersionConflictError(id, params.expectedVersion, entry.artifact.version);
    }

    const now = new Date().toISOString();
    const nextVersion = entry.artifact.version + 1;

    const updatedBase = {
      ...entry.artifact,
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.tags !== undefined ? { tags: [...params.tags] } : {}),
      version: nextVersion,
      updatedAt: now,
    };

    const artifact: Artifact =
      entry.artifact.type === "tool"
        ? {
            ...updatedBase,
            type: "tool" as const,
            schema: params.schema ?? (entry.artifact as Extract<Artifact, { type: "tool" }>).schema,
          }
        : {
            ...updatedBase,
            type: "agent" as const,
            manifest:
              params.manifest ?? (entry.artifact as Extract<Artifact, { type: "agent" }>).manifest,
          };

    const metadata: ArtifactMetadata = {
      id: artifact.id,
      name: artifact.name,
      description: artifact.description,
      type: artifact.type,
      tags: artifact.tags,
      version: artifact.version,
      status: artifact.status,
      createdBy: artifact.createdBy,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };

    this.entries.set(id, {
      artifact,
      metadata,
      lastAccessed: ++this.accessCounter,
    });

    return artifact;
  }

  /**
   * Delete an artifact by ID. Returns true if found and deleted.
   */
  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  /**
   * List artifacts with optional filters.
   */
  async list(filters?: {
    readonly type?: ArtifactType;
    readonly status?: ArtifactStatus;
    readonly tags?: readonly string[];
  }): Promise<readonly ArtifactMetadata[]> {
    let results = [...this.entries.values()].map((e) => e.metadata);

    if (filters?.type !== undefined) {
      results = results.filter((m) => m.type === filters.type);
    }
    if (filters?.status !== undefined) {
      results = results.filter((m) => m.status === filters.status);
    }
    if (filters?.tags !== undefined && filters.tags.length > 0) {
      const required = new Set(filters.tags);
      results = results.filter((m) => [...required].every((t) => m.tags.includes(t)));
    }

    return results;
  }

  /**
   * Simple keyword search over name and description fields.
   * Returns results sorted by basic relevance score.
   */
  async search(query: string): Promise<readonly { metadata: ArtifactMetadata; score: number }[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (terms.length === 0) return [];
    const scored: { metadata: ArtifactMetadata; score: number }[] = [];

    for (const entry of this.entries.values()) {
      const text = `${entry.metadata.name} ${entry.metadata.description}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          score += 1;
        }
      }
      if (score > 0) {
        scored.push({ metadata: entry.metadata, score: score / terms.length });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  /** Current number of stored artifacts */
  get size(): number {
    return this.entries.size;
  }

  /** Remove all entries */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Evict the least-recently-used entry if at capacity.
   */
  private evictIfNeeded(): void {
    if (this.entries.size < this.capacity) return;

    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}
