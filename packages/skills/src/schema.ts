/**
 * Zod validation schema for Agent Skills metadata (agentskills.io spec).
 *
 * Enforces all naming, length, and format constraints from the specification.
 */

import { z } from "zod";
import type { SkillMetadata } from "./types.js";

/**
 * Skill name validation:
 * - 1-64 characters
 * - Lowercase alphanumeric and hyphens only
 * - Must not start or end with a hyphen
 * - Must not contain consecutive hyphens
 */
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$/;
const SKILL_NAME_SINGLE_CHAR_PATTERN = /^[a-z0-9]$/;

export const SkillNameSchema = z
  .string()
  .min(1, "Skill name must be at least 1 character")
  .max(64, "Skill name must be at most 64 characters")
  .refine((name) => SKILL_NAME_PATTERN.test(name) || SKILL_NAME_SINGLE_CHAR_PATTERN.test(name), {
    message:
      "Skill name must contain only lowercase letters, numbers, and hyphens. " +
      "Must not start or end with a hyphen, and must not contain consecutive hyphens.",
  });

/**
 * Skill description validation:
 * - 1-1024 characters
 * - Non-empty
 */
export const SkillDescriptionSchema = z
  .string()
  .min(1, "Skill description must not be empty")
  .max(1024, "Skill description must be at most 1024 characters");

/**
 * Compatibility field validation:
 * - 1-500 characters if provided
 */
export const SkillCompatibilitySchema = z
  .string()
  .min(1, "Compatibility must not be empty if provided")
  .max(500, "Compatibility must be at most 500 characters");

/**
 * Metadata field validation:
 * - Arbitrary string key-value pairs
 */
export const SkillMetadataFieldSchema = z.record(z.string(), z.string());

/**
 * Complete skill frontmatter schema.
 * Validates the YAML frontmatter against the agentskills.io specification.
 */
export const SkillFrontmatterSchema = z.object({
  name: SkillNameSchema,
  description: SkillDescriptionSchema,
  license: z.string().optional(),
  compatibility: SkillCompatibilitySchema.optional(),
  metadata: SkillMetadataFieldSchema.optional(),
  "allowed-tools": z.string().optional(),
});

/**
 * Parse and validate raw frontmatter data into SkillMetadata.
 * Transforms the kebab-case `allowed-tools` field to camelCase `allowedTools`.
 */
export function validateFrontmatter(data: unknown): SkillMetadata {
  const parsed = SkillFrontmatterSchema.parse(data);
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.license !== undefined ? { license: parsed.license } : {}),
    ...(parsed.compatibility !== undefined ? { compatibility: parsed.compatibility } : {}),
    ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
    ...(parsed["allowed-tools"] !== undefined ? { allowedTools: parsed["allowed-tools"] } : {}),
  };
}

/**
 * Compile-time assertion: SkillFrontmatterSchema output keys map to SkillMetadata keys.
 * (allowedTools comes from allowed-tools transformation)
 */
type _Inferred = z.infer<typeof SkillFrontmatterSchema>;
type _FrontmatterKeys = Exclude<keyof _Inferred, "allowed-tools"> | "allowedTools";
type _MetadataKeys = keyof SkillMetadata;
type _KeyCheck = _FrontmatterKeys extends _MetadataKeys ? true : never;
type _ReverseCheck = _MetadataKeys extends _FrontmatterKeys ? true : never;
const _assertKeys: _KeyCheck & _ReverseCheck = true;
void _assertKeys;
