/**
 * LocalResolver — discovers skills from local filesystem directories.
 *
 * Scans one level deep: searchPath/&ast;/SKILL.md
 * Validates metadata during discover(), silently skips invalid skills.
 * Caches nothing - the SkillRegistry handles caching.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseSkillFile } from "./parser.js";
import type { Skill, SkillMetadata, SkillResolver } from "./types.js";

const SKILL_FILENAME = "SKILL.md";

export class LocalResolver implements SkillResolver {
  readonly name = "local" as const;
  private readonly searchPaths: readonly string[];

  constructor(searchPaths: readonly string[]) {
    this.searchPaths = searchPaths;
  }

  async discover(): Promise<readonly SkillMetadata[]> {
    const results: SkillMetadata[] = [];

    for (const searchPath of this.searchPaths) {
      const entries = await safeReaddir(searchPath);
      const parsePromises = entries.map(async (entry) => {
        const skillPath = join(searchPath, entry, SKILL_FILENAME);
        try {
          const skill = await parseSkillFile(skillPath);
          return skill.metadata;
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
