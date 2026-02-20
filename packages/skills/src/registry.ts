/**
 * SkillRegistry - in-memory registry with 3-level progressive disclosure.
 *
 * - discover() populates the metadata cache from all resolvers (parallel)
 * - load() fetches full content on demand with LRU caching
 * - loadResource() fetches bundled files on demand with LRU caching
 * - cacheStats() returns current cache tier statistics
 * - clear() resets all caches
 *
 * First resolver wins on name conflicts (resolver chain priority).
 */

import { LRUCache } from "lru-cache";
import { recordCacheAccess, recordLoadTime } from "./metrics.js";
import type {
  Skill,
  SkillCacheConfig,
  SkillCacheStats,
  SkillMetadata,
  SkillRegistryOptions,
  SkillResolver,
  SkillResource,
} from "./types.js";

/** Default cache limits */
const DEFAULT_MAX_CONTENT = 100;
const DEFAULT_MAX_RESOURCES = 200;

/**
 * Internal entry tracking which resolver owns each skill.
 */
interface RegistryEntry {
  readonly metadata: SkillMetadata;
  readonly resolverIndex: number;
}

export class SkillRegistry {
  private readonly resolvers: readonly SkillResolver[];
  private metadataCache = new Map<string, RegistryEntry>();
  private contentCache: LRUCache<string, Skill>;
  private resourceCache: LRUCache<string, SkillResource>;

  constructor(options: SkillRegistryOptions) {
    this.resolvers = options.resolvers;

    const cacheConfig: SkillCacheConfig = options.cache ?? {};
    this.contentCache = new LRUCache<string, Skill>({
      max: cacheConfig.maxContent ?? DEFAULT_MAX_CONTENT,
    });
    this.resourceCache = new LRUCache<string, SkillResource>({
      max: cacheConfig.maxResources ?? DEFAULT_MAX_RESOURCES,
    });
  }

  /**
   * Discover all skills from all resolvers in parallel.
   * Populates the metadata cache. First resolver wins on name conflicts.
   * Returns the total number of unique skills discovered.
   */
  async discover(): Promise<number> {
    this.metadataCache = new Map();
    this.contentCache.clear();
    this.resourceCache.clear();

    const start = performance.now();

    // Parallel discovery across all resolvers
    const results = await Promise.allSettled(this.resolvers.map((resolver) => resolver.discover()));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result === undefined || result.status !== "fulfilled") continue;
      for (const metadata of result.value) {
        if (!this.metadataCache.has(metadata.name)) {
          this.metadataCache.set(metadata.name, { metadata, resolverIndex: i });
        }
      }
    }

    const durationMs = performance.now() - start;
    recordLoadTime("metadata", "*", durationMs);

    return this.metadataCache.size;
  }

  /**
   * Get metadata for a discovered skill by name.
   * Returns undefined if the skill has not been discovered.
   */
  getMetadata(name: string): SkillMetadata | undefined {
    return this.metadataCache.get(name)?.metadata;
  }

  /**
   * List metadata for all discovered skills.
   */
  listMetadata(): readonly SkillMetadata[] {
    return [...this.metadataCache.values()].map((entry) => entry.metadata);
  }

  /**
   * Check whether a skill has been discovered.
   */
  has(name: string): boolean {
    return this.metadataCache.has(name);
  }

  /**
   * Load full skill content by name.
   * Uses the LRU content cache; delegates to the owning resolver on cache miss.
   * Returns undefined if the skill is not discovered.
   */
  async load(name: string): Promise<Skill | undefined> {
    const cached = this.contentCache.get(name);
    if (cached !== undefined) {
      recordCacheAccess("content", true);
      return cached;
    }

    const entry = this.metadataCache.get(name);
    if (entry === undefined) return undefined;

    recordCacheAccess("content", false);

    const resolver = this.resolvers[entry.resolverIndex];
    if (resolver === undefined) return undefined;

    const start = performance.now();
    const skill = await resolver.load(name);
    const durationMs = performance.now() - start;
    recordLoadTime("content", name, durationMs);

    if (skill !== undefined) {
      this.contentCache.set(name, skill);
    }
    return skill;
  }

  /**
   * Load a bundled resource file from a skill.
   * Uses the LRU resource cache; delegates to the owning resolver on cache miss.
   * Returns undefined if the skill is not discovered or the resolver doesn't support resources.
   */
  async loadResource(name: string, relativePath: string): Promise<SkillResource | undefined> {
    const cacheKey = `${name}\0${relativePath}`;
    const cached = this.resourceCache.get(cacheKey);
    if (cached !== undefined) {
      recordCacheAccess("resource", true);
      return cached;
    }

    const entry = this.metadataCache.get(name);
    if (entry === undefined) return undefined;

    recordCacheAccess("resource", false);

    const resolver = this.resolvers[entry.resolverIndex];
    if (resolver === undefined || resolver.loadResource === undefined) return undefined;

    const start = performance.now();
    const resource = await resolver.loadResource(name, relativePath);
    const durationMs = performance.now() - start;
    recordLoadTime("resource", name, durationMs);

    if (resource !== undefined) {
      this.resourceCache.set(cacheKey, resource);
    }
    return resource;
  }

  /**
   * Return current cache statistics across all three tiers.
   */
  cacheStats(): SkillCacheStats {
    return {
      metadata: {
        size: this.metadataCache.size,
        max: Number.POSITIVE_INFINITY,
      },
      content: {
        size: this.contentCache.size,
        max: this.contentCache.max,
      },
      resources: {
        size: this.resourceCache.size,
        max: this.resourceCache.max,
      },
    };
  }

  /**
   * Clear all caches (metadata, content, resources).
   * Call discover() again to repopulate.
   */
  clear(): void {
    this.metadataCache = new Map();
    this.contentCache.clear();
    this.resourceCache.clear();
  }
}
