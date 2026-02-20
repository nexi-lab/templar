/**
 * LocalResolver — discovers skills from local filesystem directories.
 *
 * Scans one level deep: searchPath/&ast;/SKILL.md
 * Validates metadata during discover(), silently skips invalid skills.
 * Supports loading bundled resource files (scripts/, references/, assets/).
 * Caches nothing - the SkillRegistry handles caching.
 */

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseSkillFile, parseSkillFileMetadata } from "./parser.js";
import type {
  ResourceCategory,
  Skill,
  SkillMetadata,
  SkillResolver,
  SkillResource,
} from "./types.js";

const SKILL_FILENAME = "SKILL.md";

/** Default max resource file size: 1 MB */
const DEFAULT_MAX_RESOURCE_SIZE = 1_048_576;

/** Valid resource directory prefixes mapped to their category */
const RESOURCE_PREFIX_MAP: ReadonlyMap<string, ResourceCategory> = new Map([
  ["scripts/", "script"],
  ["references/", "reference"],
  ["assets/", "asset"],
]);

export class LocalResolver implements SkillResolver {
  readonly name = "local" as const;
  private readonly searchPaths: readonly string[];
  private readonly maxResourceSize: number;

  constructor(searchPaths: readonly string[], maxResourceSize = DEFAULT_MAX_RESOURCE_SIZE) {
    this.searchPaths = searchPaths;
    this.maxResourceSize = maxResourceSize;
  }

  async discover(): Promise<readonly SkillMetadata[]> {
    const results: SkillMetadata[] = [];

    for (const searchPath of this.searchPaths) {
      const entries = await safeReaddir(searchPath);
      const parsePromises = entries.map(async (entry) => {
        const skillPath = join(searchPath, entry, SKILL_FILENAME);
        try {
          return await parseSkillFileMetadata(skillPath);
        } catch {
          // Silently skip invalid skills during discovery
          return undefined;
        }
      });

      const parsed = await Promise.all(parsePromises);
      for (const metadata of parsed) {
        if (metadata !== undefined) {
          results.push(metadata);
        }
      }
    }

    return results;
  }

  async load(name: string): Promise<Skill | undefined> {
    for (const searchPath of this.searchPaths) {
      const skillPath = join(searchPath, name, SKILL_FILENAME);
      try {
        const fileStat = await stat(skillPath);
        if (!fileStat.isFile()) continue;

        return await parseSkillFile(skillPath);
      } catch {}
    }
    return undefined;
  }

  async loadResource(name: string, relativePath: string): Promise<SkillResource | undefined> {
    // Validate relative path format
    if (!isValidResourcePath(relativePath)) {
      return undefined;
    }

    const category = inferCategory(relativePath);
    if (category === undefined) {
      return undefined;
    }

    for (const searchPath of this.searchPaths) {
      const skillDir = resolve(searchPath, name);
      const candidatePath = resolve(skillDir, relativePath);

      // Security: verify resolved path stays within skill directory
      let resolvedPath: string;
      try {
        resolvedPath = await realpath(candidatePath);
      } catch {
        // File does not exist
        continue;
      }

      const resolvedSkillDir = await safeRealpath(skillDir);
      if (resolvedSkillDir === undefined) continue;

      if (!resolvedPath.startsWith(`${resolvedSkillDir}/`)) {
        // Path traversal attempt — resolved path escapes skill directory
        return undefined;
      }

      // Check file size
      try {
        const fileStat = await stat(resolvedPath);
        if (!fileStat.isFile()) continue;
        if (fileStat.size > this.maxResourceSize) {
          return undefined;
        }
      } catch {
        continue;
      }

      // Read file content
      try {
        const content = await readFile(resolvedPath, "utf-8");
        return {
          skillName: name,
          relativePath,
          category,
          content,
          absolutePath: resolvedPath,
        };
      } catch {}
    }

    return undefined;
  }
}

/**
 * Validate that a resource path is safe and follows the required format.
 * Rejects: path traversal (..), absolute paths, paths not starting with a valid prefix.
 */
function isValidResourcePath(path: string): boolean {
  if (path.length === 0 || path.length > 500) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("..")) return false;

  // Must start with one of the valid resource directory prefixes
  for (const prefix of RESOURCE_PREFIX_MAP.keys()) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Infer resource category from the directory prefix.
 */
function inferCategory(path: string): ResourceCategory | undefined {
  for (const [prefix, category] of RESOURCE_PREFIX_MAP) {
    if (path.startsWith(prefix)) return category;
  }
  return undefined;
}

/**
 * Read directory entries, returning empty array if the directory doesn't exist.
 */
async function safeReaddir(dirPath: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Resolve real path, returning undefined if the path doesn't exist.
 */
async function safeRealpath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}
