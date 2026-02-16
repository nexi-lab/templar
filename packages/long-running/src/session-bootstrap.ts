import * as fs from "node:fs/promises";
import { FeatureList } from "./feature-list.js";
import { gitLog, isGitAvailable, isGitRepo } from "./git-ops.js";
import { ProgressFile } from "./progress-file.js";
import type { ResolvedLongRunningConfig, SessionBootstrapContext } from "./types.js";

/**
 * Bootstrap a session by loading workspace state in parallel.
 *
 * Determines the session mode (initializer vs coder) based on whether
 * a feature list file already exists.
 *
 * @throws When git is unavailable or workspace is invalid.
 */
export async function bootstrap(
  config: ResolvedLongRunningConfig,
): Promise<SessionBootstrapContext> {
  // 1. Validate workspace exists and is writable
  await validateWorkspace(config.workspace);

  // 2. Verify git is available and workspace is a git repo
  const gitAvailable = await isGitAvailable();
  if (!gitAvailable) {
    throw new Error("LONGRUNNING_GIT_UNAVAILABLE: Git binary is not installed on this system");
  }

  const isRepo = await isGitRepo(config.workspace);
  if (!isRepo) {
    throw new Error("LONGRUNNING_GIT_UNAVAILABLE: Workspace is not a git repository");
  }

  // 3. Parallel reads: feature list + progress file + git log
  const [featureList, progressFile, recentLog] = await Promise.all([
    FeatureList.load(config.workspace, config.featureListPath),
    ProgressFile.load(config.workspace, config),
    gitLog(config.workspace, { limit: 20, timeoutMs: config.gitTimeoutMs }),
  ]);

  // 4. Determine mode
  const mode = featureList === null ? "initializer" : "coder";

  // 5. Build context
  const totalFeatures = featureList?.summary.total ?? 0;
  const completedFeatures = featureList?.summary.completed ?? 0;
  const nextFeatures = featureList?.nextIncomplete(5) ?? [];

  return {
    mode,
    featureList: featureList?.toDocument() ?? null,
    recentProgress: progressFile.entries,
    gitLog: recentLog,
    totalFeatures,
    completedFeatures,
    nextFeatures,
  };
}

/**
 * Validate that the workspace exists, is a directory, and is writable.
 */
async function validateWorkspace(workspace: string): Promise<void> {
  try {
    const stat = await fs.stat(workspace);
    if (!stat.isDirectory()) {
      throw new Error("LONGRUNNING_WORKSPACE_INVALID: Workspace path is not a directory");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("LONGRUNNING_")) {
      throw err;
    }
    throw new Error(`LONGRUNNING_WORKSPACE_INVALID: Workspace path does not exist: ${workspace}`);
  }

  // Verify writable by trying to access with write permission
  try {
    await fs.access(workspace, fs.constants.W_OK);
  } catch {
    throw new Error("LONGRUNNING_WORKSPACE_INVALID: Workspace path is not writable");
  }
}
