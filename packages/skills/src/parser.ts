/**
 * SKILL.md parser — extracts YAML frontmatter + markdown body.
 *
 * Uses gray-matter for robust frontmatter parsing (handles BOM, Windows CRLF,
 * escaped delimiters, etc.) and validates via the Zod schema.
 */

import { readFile } from "node:fs/promises";
import { SkillParseError, SkillValidationError } from "@templar/errors";
import matter from "gray-matter";
import type { ZodError } from "zod";
import { validateFrontmatter } from "./schema.js";
import type { Skill, SkillMetadata } from "./types.js";

/**
 * Parse SKILL.md content from a string.
 *
 * @param raw - Raw SKILL.md file content
 * @param filePath - Optional file path for error messages and result
 * @returns Parsed Skill with validated metadata and body content
 * @throws SkillParseError if the content has no valid frontmatter
 * @throws SkillValidationError if the metadata fails schema validation
 */
export function parseSkillContent(raw: string, filePath = ""): Skill {
  const parsed = matter(raw);

  // gray-matter returns an empty object for missing frontmatter
  if (
    parsed.data === undefined ||
    parsed.data === null ||
    (typeof parsed.data === "object" && Object.keys(parsed.data).length === 0)
  ) {
    throw new SkillParseError(
      filePath || undefined,
      "SKILL.md must contain YAML frontmatter between --- delimiters",
    );
  }

  let metadata: SkillMetadata;
  try {
    metadata = validateFrontmatter(parsed.data);
  } catch (error: unknown) {
    const zodError = error as ZodError;
    if (zodError.issues) {
      const issues = zodError.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      throw new SkillValidationError(
        typeof parsed.data === "object" && parsed.data !== null
          ? ((parsed.data as Record<string, unknown>).name as string | undefined)
          : undefined,
        issues,
      );
    }
    throw new SkillParseError(filePath || undefined, String(error));
  }

  return {
    metadata,
    content: parsed.content.trim(),
    filePath,
  };
}

/**
 * Parse a SKILL.md file from disk.
 *
 * @param path - Absolute path to the SKILL.md file
 * @returns Parsed Skill with validated metadata and body content
 * @throws SkillParseError if the file cannot be read or has no valid frontmatter
 * @throws SkillValidationError if the metadata fails schema validation
 */
export async function parseSkillFile(path: string): Promise<Skill> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error: unknown) {
    throw new SkillParseError(
      path,
      `Failed to read file: ${(error as Error).message}`,
      error as Error,
    );
  }
  return parseSkillContent(raw, path);
}
