/**
 * @templar/manifest
 *
 * YAML agent definition loader for Templar.
 * Reads templar.yaml files, validates them with Zod, and returns
 * typed, frozen AgentManifest objects.
 */

// ============================================================================
// PRIMARY API
// ============================================================================

export { type LoadManifestOptions, loadManifest } from "./loader.js";
export { normalizeManifest } from "./normalize.js";
export { type ParseManifestOptions, parseManifestYaml } from "./parser.js";

// ============================================================================
// BOOTSTRAP
// ============================================================================

export {
  BOOTSTRAP_FILENAMES,
  DEFAULT_BUDGET,
  type ResolveBootstrapOptions,
  resolveBootstrapFiles,
} from "./bootstrap-resolver.js";
export { fileExists, readTextFile } from "./fs-utils.js";
export {
  type TruncateOptions,
  type TruncateResult,
  truncateContent,
} from "./truncate.js";

// ============================================================================
// SCHEMA
// ============================================================================

export {
  AgentManifestSchema,
  BootstrapBudgetSchema,
  BootstrapPathConfigSchema,
  ChannelIdentityConfigSchema,
  IdentityConfigSchema,
  PromptSchema,
  ScheduleSchema,
  SessionScopingSchema,
  SkillRefSchema,
} from "./schema.js";

// ============================================================================
// UTILITIES
// ============================================================================

export { deepFreeze } from "./freeze.js";
export { interpolateEnvVars } from "./interpolation.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/manifest";
export const PACKAGE_VERSION = "0.0.0";
