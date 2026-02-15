/**
 * Bootstrap file resolver — reads and resolves TEMPLAR.md, TOOLS.md,
 * and CONTEXT.md into an immutable BootstrapContext.
 *
 * High Templar (copilot) agents load all 3 files.
 * Dark Templar (worker) agents load only TEMPLAR.md (instructions).
 */

import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  BootstrapBudget,
  BootstrapContext,
  BootstrapFile,
  BootstrapFileKind,
  BootstrapPathConfig,
} from "@templar/core";
import { BootstrapParseFailedError } from "@templar/errors";

import { deepFreeze } from "./freeze.js";
import { fileExists, readTextFile } from "./fs-utils.js";
import { truncateContent } from "./truncate.js";

/** Default per-file character budgets */
export const DEFAULT_BUDGET: Readonly<BootstrapBudget> = {
  instructions: 10_000,
  tools: 6_000,
  context: 4_000,
};

/** Default file names for each bootstrap kind */
export const BOOTSTRAP_FILENAMES: Readonly<Record<BootstrapFileKind, string>> = {
  instructions: "TEMPLAR.md",
  tools: "TOOLS.md",
  context: "CONTEXT.md",
};

export interface ResolveBootstrapOptions {
  readonly manifestDir: string;
  readonly agentType?: "high" | "dark";
  readonly bootstrap?: BootstrapPathConfig;
}

/**
 * Resolves bootstrap files from a manifest directory.
 *
 * Missing files are silently skipped (graceful partial loading).
 * Binary files throw BootstrapParseFailedError (via readTextFile).
 * Oversized files are truncated to fit the budget.
 *
 * @returns Deeply frozen, immutable BootstrapContext
 */
export async function resolveBootstrapFiles(
  options: ResolveBootstrapOptions,
): Promise<BootstrapContext> {
  const budget: BootstrapBudget = {
    ...DEFAULT_BUDGET,
    ...options.bootstrap?.budget,
  };

  // Dark Templar: only instructions
  const kinds: readonly BootstrapFileKind[] =
    options.agentType === "dark" ? ["instructions"] : ["instructions", "tools", "context"];

  // Resolve file paths (custom or default) with path traversal guard
  const manifestDirResolved = resolve(options.manifestDir);
  const pathMap = kinds.map((kind) => {
    const rawPath = options.bootstrap?.[kind] ?? BOOTSTRAP_FILENAMES[kind];
    const filePath = resolve(manifestDirResolved, rawPath);

    // Guard against path traversal outside manifest directory
    const rel = relative(manifestDirResolved, filePath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new BootstrapParseFailedError(rawPath, "Bootstrap path escapes the manifest directory");
    }

    return { kind, filePath, budget: budget[kind] };
  });

  // Parallel reads
  const results = await Promise.all(
    pathMap.map(async ({ kind, filePath, budget: fileBudget }) => {
      const exists = await fileExists(filePath);
      if (!exists) {
        return undefined; // Missing files are OK (graceful partial)
      }

      const raw = await readTextFile(filePath);
      if (raw.length === 0) {
        return {
          kind,
          content: "",
          filePath,
          originalSize: 0,
          truncated: false,
          contentHash: hashContent(""),
        } satisfies BootstrapFile;
      }

      const truncated = truncateContent(raw, {
        budget: fileBudget,
        filePath,
      });
      return {
        kind,
        content: truncated.content,
        filePath,
        originalSize: truncated.originalSize,
        truncated: truncated.truncated,
        contentHash: hashContent(truncated.content),
      } satisfies BootstrapFile;
    }),
  );

  const files = results.filter((f): f is BootstrapFile => f !== undefined);

  return deepFreeze({
    files,
    totalSize: files.reduce((sum, f) => sum + f.content.length, 0),
    resolvedFrom: options.manifestDir,
  });
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
