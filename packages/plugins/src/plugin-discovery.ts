import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TemplarPluginDefinition } from "@templar/core";
import type { DiscoveredPlugin, PluginSource } from "./types.js";

// ---------------------------------------------------------------------------
// Project-tier discovery (templar.yaml plugins section)
// ---------------------------------------------------------------------------

/**
 * Discover project-local plugins by scanning the project plugins directory.
 *
 * Each subdirectory with an `index.ts`, `index.js`, or `package.json`
 * is treated as a plugin.
 */
export async function discoverProjectPlugins(projectDir: string): Promise<DiscoveredPlugin[]> {
  return scanPluginDir(projectDir, "project");
}

// ---------------------------------------------------------------------------
// User-tier discovery (~/.templar/plugins)
// ---------------------------------------------------------------------------

/**
 * Discover user-global plugins by scanning the user plugins directory.
 */
export async function discoverUserPlugins(userDir: string): Promise<DiscoveredPlugin[]> {
  return scanPluginDir(userDir, "user");
}

// ---------------------------------------------------------------------------
// Bundled-tier (static imports — pass-through)
// ---------------------------------------------------------------------------

/**
 * Wrap statically imported bundled plugins into DiscoveredPlugin entries.
 */
export function discoverBundledPlugins(
  bundled: readonly TemplarPluginDefinition[],
): DiscoveredPlugin[] {
  return bundled.map((p) => ({
    name: p.name,
    path: `bundled:${p.name}`,
    source: "bundled" as const,
  }));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function scanPluginDir(dir: string, source: PluginSource): Promise<DiscoveredPlugin[]> {
  const results: DiscoveredPlugin[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory doesn't exist — that's fine, return empty
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const info = await stat(fullPath);
      if (!info.isDirectory()) continue;

      // Check for plugin entry points
      const hasEntry = await hasPluginEntry(fullPath);
      if (hasEntry) {
        results.push({ name: entry, path: fullPath, source });
      }
    } catch {
      // Skip entries that can't be stat'd
    }
  }

  return results;
}

async function hasPluginEntry(dir: string): Promise<boolean> {
  const candidates = ["index.ts", "index.js", "index.mjs", "package.json"];
  for (const candidate of candidates) {
    try {
      const info = await stat(join(dir, candidate));
      if (info.isFile()) return true;
    } catch {
      // File doesn't exist — try next
    }
  }
  return false;
}
