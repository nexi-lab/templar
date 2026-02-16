import * as childProcess from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gitCommit,
  gitLog,
  gitRevert,
  gitShowFile,
  gitStatus,
  isGitAvailable,
  isGitRepo,
} from "../git-ops.js";

// We'll use mock tests for command construction validation
// Real git tests are in git-ops.integration.test.ts

vi.mock("node:child_process");

const mockedExecFile = vi.mocked(childProcess.execFile);

function mockExecFileSuccess(stdout = "", stderr = ""): void {
  mockedExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      (callback as (err: null, stdout: string, stderr: string) => void)(null, stdout, stderr);
      return {} as childProcess.ChildProcess;
    },
  );
}

function mockExecFileError(message: string, code = 1): void {
  mockedExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      const err = new Error(message) as Error & { code: number };
      err.code = code;
      (callback as (err: Error) => void)(err);
      return {} as childProcess.ChildProcess;
    },
  );
}

describe("git-ops (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isGitAvailable", () => {
    it("returns true when git is available", async () => {
      mockExecFileSuccess("git version 2.40.0");
      const result = await isGitAvailable();
      expect(result).toBe(true);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["--version"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("returns false when git is not available", async () => {
      mockExecFileError("command not found");
      const result = await isGitAvailable();
      expect(result).toBe(false);
    });
  });

  describe("isGitRepo", () => {
    it("returns true for a git repo", async () => {
      mockExecFileSuccess("true");
      const result = await isGitRepo("/workspace");
      expect(result).toBe(true);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "--is-inside-work-tree"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
    });

    it("returns false for a non-git directory", async () => {
      mockExecFileError("not a git repository");
      const result = await isGitRepo("/not-a-repo");
      expect(result).toBe(false);
    });
  });

  describe("gitLog", () => {
    it("constructs correct command with limit", async () => {
      mockExecFileSuccess("abc123 feat: add login\ndef456 fix: typo\n");
      const result = await gitLog("/workspace", { limit: 5 });

      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["log", "--oneline", "-n", "5"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("abc123 feat: add login");
    });

    it("uses default limit of 20", async () => {
      mockExecFileSuccess("");
      await gitLog("/workspace");
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["log", "--oneline", "-n", "20"],
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe("gitCommit", () => {
    it("uses selective git add with specific files", async () => {
      // First call: git add
      // Second call: git commit
      mockedExecFile.mockImplementation(
        (_cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
          const argsArr = args as string[];
          if (argsArr[0] === "add") {
            (callback as (err: null, stdout: string, stderr: string) => void)(null, "", "");
          } else if (argsArr[0] === "commit") {
            (callback as (err: null, stdout: string, stderr: string) => void)(
              null,
              "[main abc1234] feat: login\n",
              "",
            );
          }
          return {} as childProcess.ChildProcess;
        },
      );

      const _sha = await gitCommit("/workspace", {
        files: ["src/login.ts", "src/auth.ts"],
        message: "feat: login",
      });

      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["add", "--", "src/login.ts", "src/auth.ts"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "feat: login"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
    });
  });

  describe("gitRevert", () => {
    it("constructs correct revert command", async () => {
      mockExecFileSuccess("");
      await gitRevert("/workspace", "abc123");

      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["revert", "--no-edit", "abc123"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
    });
  });

  describe("gitStatus", () => {
    it("parses clean workspace", async () => {
      mockExecFileSuccess("");
      const result = await gitStatus("/workspace");

      expect(result.clean).toBe(true);
      expect(result.modifiedFiles).toHaveLength(0);
    });

    it("parses dirty workspace", async () => {
      mockExecFileSuccess(" M src/index.ts\n?? new-file.ts\n");
      const result = await gitStatus("/workspace");

      expect(result.clean).toBe(false);
      expect(result.modifiedFiles).toContain("src/index.ts");
      expect(result.modifiedFiles).toContain("new-file.ts");
    });
  });

  describe("gitShowFile", () => {
    it("returns file content from a commit", async () => {
      mockExecFileSuccess('{"features":[]}');
      const result = await gitShowFile("/workspace", "HEAD~1", "feature-list.json");

      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["show", "HEAD~1:feature-list.json"],
        expect.objectContaining({ cwd: "/workspace" }),
        expect.any(Function),
      );
      expect(result).toBe('{"features":[]}');
    });

    it("returns null when file is not found in commit", async () => {
      mockExecFileError("does not exist in 'HEAD~1'");
      const result = await gitShowFile("/workspace", "HEAD~1", "nonexistent.json");
      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    it("gitCommit throws on failure", async () => {
      mockExecFileError("nothing to commit");
      await expect(gitCommit("/workspace", { files: ["f.ts"], message: "test" })).rejects.toThrow();
    });

    it("gitRevert throws on failure", async () => {
      mockExecFileError("error: could not revert");
      await expect(gitRevert("/workspace", "bad-sha")).rejects.toThrow();
    });
  });
});
