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
export { type ParseManifestOptions, parseManifestYaml } from "./parser.js";

// ============================================================================
// SCHEMA
// ============================================================================

export {
  AgentManifestSchema,
  ChannelIdentityConfigSchema,
  IdentityConfigSchema,
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
