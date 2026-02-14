/**
 * Type definitions for the Agent Skills standard (agentskills.io).
 *
 * Two-level type system for progressive disclosure:
 * - SkillMetadata: lightweight (~100 tokens), loaded at startup
 * - Skill: full content, loaded on demand when a skill is activated
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
 * Skill resolver — discovers and loads skills from a source.
 *
 * Progressive disclosure:
 * - discover() returns lightweight metadata for all available skills
 * - load() returns full skill content on demand
 */
export interface SkillResolver {
  /** Resolver name (for logging and debugging) */
  readonly name: string;
  /** Discover all available skills, returning metadata only */
  discover(): Promise<readonly SkillMetadata[]>;
  /** Load a specific skill's full content by name */
  load(name: string): Promise<Skill | undefined>;
}
