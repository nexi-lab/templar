/**
 * Shared file I/O utilities for manifest and bootstrap file loading.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { BootstrapParseFailedError } from "@templar/errors";

/** Number of bytes to check for null bytes (binary detection) */
const NULL_BYTE_CHECK_SIZE = 8192;

/**
 * Reads a text file, detecting binary content and stripping BOM.
 *
 * @throws {BootstrapParseFailedError} if file contains null bytes (binary)
 */
export async function readTextFile(filePath: string): Promise<string> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, "utf-8");

  // Binary detection: check for null bytes in first 8KB
  const checkRegion = content.slice(0, NULL_BYTE_CHECK_SIZE);
  if (checkRegion.includes("\0")) {
    throw new BootstrapParseFailedError(
      absolutePath,
      "File appears to be binary, not text",
    );
  }

  // Strip BOM if present
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/**
 * Checks whether a path points to an existing regular file.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(resolve(filePath));
    return s.isFile();
  } catch {
    return false;
  }
}
