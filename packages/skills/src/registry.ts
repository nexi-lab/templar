/**
 * SkillRegistry - in-memory registry with progressive disclosure.
 *
 * - discover() populates the metadata cache from all resolvers
 * - load() fetches full content on demand and caches it
 * - clear() resets both caches
 *
 * First resolver wins on name conflicts (resolver chain priority).
 */

import type { Skill, SkillMetadata, SkillResolver } from "./types.js";

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
  private contentCache = new Map<string, Skill>();

  constructor(resolvers: readonly SkillResolver[]) {
    this.resolvers = resolvers;
  }

  /**
   * Discover all skills from all resolvers.
   * Populates the metadata cache. First resolver wins on name conflicts.
   * Returns the total number of unique skills discovered.
   */
  async discover(): Promise<number> {
    this.metadataCache = new Map();
    this.contentCache = new Map();

    for (let i = 0; i < this.resolvers.length; i++) {
      const resolver = this.resolvers[i];
      if (resolver === undefined) continue;
      const skills = await resolver.discover();
      for (const metadata of skills) {
        if (!this.metadataCache.has(metadata.name)) {
          this.metadataCache.set(metadata.name, { metadata, resolverIndex: i });
        }
      }
    }

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
   * Uses the content cache; delegates to the owning resolver on cache miss.
   * Returns undefined if the skill is not discovered.
   */
  async load(name: string): Promise<Skill | undefined> {
    const cached = this.contentCache.get(name);
    if (cached !== undefined) return cached;

    const entry = this.metadataCache.get(name);
    if (entry === undefined) return undefined;

    const resolver = this.resolvers[entry.resolverIndex];
    if (resolver === undefined) return undefined;

    const skill = await resolver.load(name);
    if (skill !== undefined) {
      this.contentCache.set(name, skill);
    }
    return skill;
  }

  /**
   * Clear both metadata and content caches.
   * Call discover() again to repopulate.
   */
  clear(): void {
    this.metadataCache = new Map();
    this.contentCache = new Map();
  }
}
