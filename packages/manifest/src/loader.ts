/**
 * Async file-based manifest loader.
 * Reads a YAML file from disk and delegates to parseManifestYaml().
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AgentManifest } from "@templar/core";
import { ManifestFileNotFoundError } from "@templar/errors";

import type { ParseManifestOptions } from "./parser.js";
import { parseManifestYaml } from "./parser.js";

export interface LoadManifestOptions extends ParseManifestOptions {
  readonly encoding?: BufferEncoding;
}

/**
 * Reads a YAML manifest file and returns a validated, frozen AgentManifest.
 *
 * @param filePath — path to the YAML file (relative or absolute)
 * @param options — encoding, env map, skipInterpolation
 */
export async function loadManifest(
  filePath: string,
  options?: LoadManifestOptions,
): Promise<AgentManifest> {
  const absolutePath = resolve(filePath);

  let content: string;
  try {
    content = await readFile(absolutePath, {
      encoding: options?.encoding ?? "utf-8",
    });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new ManifestFileNotFoundError(absolutePath);
    }
    throw error;
  }

  return parseManifestYaml(content, options);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
