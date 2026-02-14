/**
 * @templar/skills
 *
 * Agent Skills standard (agentskills.io) parser, validator, and registry.
 * Implements progressive disclosure: metadata at startup, full content on demand.
 */

export { LocalResolver } from "./local-resolver.js";
// Parser
export { parseSkillContent, parseSkillFile } from "./parser.js";
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
export type { Skill, SkillMetadata } from "./types.js";
