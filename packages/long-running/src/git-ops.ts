import { execFile as execFileCb } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;
const SAFE_GIT_REF = /^[a-zA-Z0-9_./~^{}-]+$/;

/**
 * Validate that a git ref does not start with `-` and matches safe patterns.
 */
function validateGitRef(ref: string): void {
  if (!ref || ref.startsWith("-") || !SAFE_GIT_REF.test(ref)) {
    throw new Error(`Invalid git reference: "${ref}"`);
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

function execFile(
  cmd: string,
  args: readonly string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    execFileCb(
      cmd,
      args as string[],
      {
        cwd: opts.cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        }
      },
    );
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if the git binary is available on the system.
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFile("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a workspace directory is inside a git repository.
 */
export async function isGitRepo(workspace: string): Promise<boolean> {
  try {
    await execFile("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: workspace,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recent git log entries.
 */
export async function gitLog(
  workspace: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<readonly string[]> {
  const limit = opts.limit ?? 20;
  const { stdout } = await execFile("git", ["log", "--oneline", "-n", String(limit)], {
    cwd: workspace,
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Commit specific files with a message.
 * Uses selective `git add <files>` — never `git add -A`.
 * Returns the commit SHA.
 */
export async function gitCommit(
  workspace: string,
  request: { readonly files: readonly string[]; readonly message: string },
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  if (request.files.length === 0) {
    throw new Error("gitCommit requires at least one file");
  }
  if (!request.message || request.message.trim().length === 0) {
    throw new Error("gitCommit requires a non-empty commit message");
  }

  // Stage specific files
  const execOpts = { cwd: workspace, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) };

  await execFile("git", ["add", "--", ...request.files], execOpts);

  // Commit
  const { stdout } = await execFile("git", ["commit", "-m", request.message], execOpts);

  // Extract SHA from output like "[main abc1234] message"
  const match = /\[[\w/-]+ ([a-f0-9]+)\]/.exec(stdout);
  return match?.[1] ?? "";
}

/**
 * Revert a commit (creates a new revert commit).
 */
export async function gitRevert(
  workspace: string,
  commitSha: string,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  validateGitRef(commitSha);
  await execFile("git", ["revert", "--no-edit", commitSha], {
    cwd: workspace,
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
}

/**
 * Get workspace status.
 */
export async function gitStatus(
  workspace: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ clean: boolean; modifiedFiles: readonly string[] }> {
  const { stdout } = await execFile("git", ["status", "--porcelain"], {
    cwd: workspace,
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });

  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const modifiedFiles = lines.map((line) => {
    // Status format: "XY filename" — skip the 2-char status + space
    return line.slice(2).trim();
  });

  return {
    clean: modifiedFiles.length === 0,
    modifiedFiles,
  };
}

/**
 * Get file content from a specific commit.
 * Returns null if the file does not exist at that commit.
 */
export async function gitShowFile(
  workspace: string,
  commitRef: string,
  filePath: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  validateGitRef(commitRef);
  try {
    const { stdout } = await execFile("git", ["show", `${commitRef}:${filePath}`], {
      cwd: workspace,
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
    return stdout;
  } catch {
    return null;
  }
}
