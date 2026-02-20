/**
 * @templar/skills
 *
 * Agent Skills standard (agentskills.io) parser, validator, and registry.
 * Implements 3-level progressive disclosure:
 *   Level 1: metadata at startup
 *   Level 2: full content on demand
 *   Level 3: bundled resources on demand
 */

export { LocalResolver } from "./local-resolver.js";
// Metrics
export {
  getSkillCacheAccess,
  getSkillLoadDuration,
  type LoadLevel,
  recordCacheAccess,
  recordLoadTime,
} from "./metrics.js";
// Parser
export {
  parseSkillContent,
  parseSkillFile,
  parseSkillFileMetadata,
  parseSkillMetadataOnly,
} from "./parser.js";
// Registry
export { SkillRegistry } from "./registry.js";

// Resolvers
export type { SkillResolver } from "./resolver.js";
// Schema validation
export {
  SkillCompatibilitySchema,
  SkillDescriptionSchema,
  SkillFrontmatterSchema,
  SkillNameSchema,
  validateFrontmatter,
} from "./schema.js";
// Types
export type {
  CacheTierStats,
  ResourceCategory,
  Skill,
  SkillCacheConfig,
  SkillCacheStats,
  SkillMetadata,
  SkillRegistryOptions,
  SkillResource,
} from "./types.js";
