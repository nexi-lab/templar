/**
 * Type definitions for the Agent Skills standard (agentskills.io).
 *
 * Three-level type system for progressive disclosure:
 * - SkillMetadata: lightweight (~100 tokens), loaded at startup
 * - Skill: full content, loaded on demand when a skill is activated
 * - SkillResource: bundled file, loaded on demand when referenced
 */

/**
 * Skill metadata — lightweight representation loaded during discovery.
 * Contains only YAML frontmatter fields, no body content.
 */
export interface SkillMetadata {
  /** Skill name (1-64 chars, lowercase alphanumeric + hyphens) */
  readonly name: string;
  /** What the skill does and when to use it (1-1024 chars) */
  readonly description: string;
  /** License name or reference to bundled license file */
  readonly license?: string;
  /** Environment requirements (intended product, system packages, network access) */
  readonly compatibility?: string;
  /** Arbitrary key-value metadata (author, version, category, etc.) */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Space-delimited list of pre-approved tools (experimental) */
  readonly allowedTools?: string;
}

/**
 * Full skill — metadata + markdown body content.
 * Loaded on demand when an agent activates the skill.
 */
export interface Skill {
  /** Validated metadata from YAML frontmatter */
  readonly metadata: SkillMetadata;
  /** Markdown body content (instructions for the agent) */
  readonly content: string;
  /** Absolute path to the SKILL.md file (for resolving relative references) */
  readonly filePath: string;
}

/**
 * Resource categories for bundled skill files.
 * Strict 3-category classification matching agentskills.io spec.
 */
export type ResourceCategory = "script" | "reference" | "asset";

/**
 * A bundled resource file within a skill directory.
 * Loaded on demand when referenced during skill execution.
 */
export interface SkillResource {
  /** Name of the owning skill */
  readonly skillName: string;
  /** Relative path within the skill directory (e.g. "scripts/extract.py") */
  readonly relativePath: string;
  /** Resource category inferred from directory prefix */
  readonly category: ResourceCategory;
  /** File content (UTF-8 string) */
  readonly content: string;
  /** Resolved absolute path on disk */
  readonly absolutePath: string;
}

/**
 * Configuration for the skill registry LRU caches.
 */
export interface SkillCacheConfig {
  /** Maximum number of full skill bodies to cache (default: 100) */
  readonly maxContent?: number;
  /** Maximum number of resource files to cache (default: 200) */
  readonly maxResources?: number;
  /** Maximum size in bytes for a single resource file (default: 1MB) */
  readonly maxResourceSize?: number;
}

/**
 * Statistics for a single cache tier.
 */
export interface CacheTierStats {
  /** Current number of cached entries */
  readonly size: number;
  /** Maximum capacity */
  readonly max: number;
}

/**
 * Aggregate cache statistics across all three tiers.
 */
export interface SkillCacheStats {
  readonly metadata: CacheTierStats;
  readonly content: CacheTierStats;
  readonly resources: CacheTierStats;
}

/**
 * Options for constructing a SkillRegistry.
 */
export interface SkillRegistryOptions {
  /** Ordered list of resolvers (first wins on name conflicts) */
  readonly resolvers: readonly SkillResolver[];
  /** LRU cache configuration (optional, uses defaults if omitted) */
  readonly cache?: SkillCacheConfig;
}

/**
 * Skill resolver — discovers and loads skills from a source.
 *
 * Progressive disclosure:
 * - discover() returns lightweight metadata for all available skills
 * - load() returns full skill content on demand
 * - loadResource() returns bundled file content on demand (optional)
 */
export interface SkillResolver {
  /** Resolver name (for logging and debugging) */
  readonly name: string;
  /** Discover all available skills, returning metadata only */
  discover(): Promise<readonly SkillMetadata[]>;
  /** Load a specific skill's full content by name */
  load(name: string): Promise<Skill | undefined>;
  /** Load a bundled resource file from a skill directory (optional) */
  loadResource?(name: string, relativePath: string): Promise<SkillResource | undefined>;
}
