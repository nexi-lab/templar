import { execFile as execFileCb } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  gitCommit,
  gitLog,
  gitRevert,
  gitShowFile,
  gitStatus,
  isGitAvailable,
  isGitRepo,
} from "../git-ops.js";

function exec(cmd: string, args: string[], opts: { cwd: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, opts, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

describe("git-ops (integration)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join("/tmp", "git-ops-int-"));
    // Init a real git repo
    await exec("git", ["init"], { cwd: tmpDir });
    await exec("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir });
    await exec("git", ["config", "user.name", "Test"], { cwd: tmpDir });
    // Create initial commit
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Test\n");
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("isGitAvailable returns true", async () => {
    const result = await isGitAvailable();
    expect(result).toBe(true);
  });

  it("isGitRepo returns true for a git repo", async () => {
    const result = await isGitRepo(tmpDir);
    expect(result).toBe(true);
  });

  it("isGitRepo returns false for non-git directory", async () => {
    const nonGitDir = await fs.mkdtemp(path.join("/tmp", "non-git-"));
    try {
      const result = await isGitRepo(nonGitDir);
      expect(result).toBe(false);
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it("makes changes, commits, and verifies log", async () => {
    await fs.writeFile(path.join(tmpDir, "new-file.ts"), "export const x = 1;\n");

    const sha = await gitCommit(tmpDir, {
      files: ["new-file.ts"],
      message: "feat: add new file",
    });

    expect(sha).toBeTruthy();
    expect(sha.length).toBeGreaterThanOrEqual(7);

    const log = await gitLog(tmpDir, { limit: 5 });
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0]).toContain("feat: add new file");
  });

  it("reverts a commit and verifies state", async () => {
    await fs.writeFile(path.join(tmpDir, "to-revert.ts"), "bad code\n");
    await gitCommit(tmpDir, {
      files: ["to-revert.ts"],
      message: "feat: bad commit",
    });

    // Get the SHA of the commit to revert
    const log = await gitLog(tmpDir, { limit: 1 });
    const sha = log[0]?.split(" ")[0] ?? "";

    await gitRevert(tmpDir, sha);

    // File should be gone after revert
    const exists = await fs
      .stat(path.join(tmpDir, "to-revert.ts"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("reports dirty workspace status", async () => {
    await fs.writeFile(path.join(tmpDir, "dirty.ts"), "changed\n");

    const status = await gitStatus(tmpDir);
    expect(status.clean).toBe(false);
    expect(status.modifiedFiles).toContain("dirty.ts");
  });

  it("reports clean workspace status", async () => {
    const status = await gitStatus(tmpDir);
    expect(status.clean).toBe(true);
    expect(status.modifiedFiles).toHaveLength(0);
  });

  it("commits specific files only", async () => {
    await fs.writeFile(path.join(tmpDir, "file-a.ts"), "a\n");
    await fs.writeFile(path.join(tmpDir, "file-b.ts"), "b\n");

    await gitCommit(tmpDir, {
      files: ["file-a.ts"],
      message: "feat: only file-a",
    });

    // file-b should still be untracked
    const status = await gitStatus(tmpDir);
    expect(status.clean).toBe(false);
    expect(status.modifiedFiles).toContain("file-b.ts");
  });

  it("gitShowFile returns content from a specific commit", async () => {
    await fs.writeFile(path.join(tmpDir, "data.json"), '{"version": 1}\n');
    await gitCommit(tmpDir, {
      files: ["data.json"],
      message: "feat: add data",
    });

    // Modify the file
    await fs.writeFile(path.join(tmpDir, "data.json"), '{"version": 2}\n');
    await gitCommit(tmpDir, {
      files: ["data.json"],
      message: "feat: update data",
    });

    // Read the previous version
    const content = await gitShowFile(tmpDir, "HEAD~1", "data.json");
    expect(content).toContain('"version": 1');
  });

  it("gitShowFile returns null for nonexistent file", async () => {
    const result = await gitShowFile(tmpDir, "HEAD", "nonexistent.json");
    expect(result).toBeNull();
  });
});
