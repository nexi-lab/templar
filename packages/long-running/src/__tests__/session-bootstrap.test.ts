import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureList } from "../feature-list.js";
import { bootstrap } from "../session-bootstrap.js";
import type { ResolvedLongRunningConfig } from "../types.js";

// Mock git-ops for controlled testing
vi.mock("../git-ops.js", () => ({
  isGitAvailable: vi.fn().mockResolvedValue(true),
  isGitRepo: vi.fn().mockResolvedValue(true),
  gitLog: vi.fn().mockResolvedValue(["abc123 initial commit"]),
}));

function makeConfig(workspace: string): ResolvedLongRunningConfig {
  return {
    workspace,
    maxActiveFeatures: 1,
    progressWindowSize: 10,
    gitTimeoutMs: 30_000,
    featureListPath: "feature-list.json",
    progressFilePath: "progress.json",
    progressArchivePath: "progress-archive.json",
    initScriptPath: "init.sh",
  };
}

describe("bootstrap", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join("/tmp", "bootstrap-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns initializer mode when no feature list exists", async () => {
    const config = makeConfig(tmpDir);
    const result = await bootstrap(config);

    expect(result.mode).toBe("initializer");
    expect(result.featureList).toBeNull();
    expect(result.totalFeatures).toBe(0);
    expect(result.completedFeatures).toBe(0);
    expect(result.nextFeatures).toHaveLength(0);
  });

  it("returns coder mode when feature list exists", async () => {
    const config = makeConfig(tmpDir);

    // Create a feature list
    const features = [
      {
        id: "feat-1",
        category: "functional" as const,
        description: "Test",
        priority: 1,
        steps: ["Step 1"],
        passes: false,
      },
      {
        id: "feat-2",
        category: "functional" as const,
        description: "Test 2",
        priority: 2,
        steps: ["Step 1"],
        passes: true,
      },
    ];
    const list = FeatureList.create(features);
    await list.save(tmpDir, config.featureListPath);

    const result = await bootstrap(config);

    expect(result.mode).toBe("coder");
    expect(result.featureList).not.toBeNull();
    expect(result.totalFeatures).toBe(2);
    expect(result.completedFeatures).toBe(1);
    expect(result.nextFeatures).toHaveLength(1);
    expect(result.nextFeatures[0]?.id).toBe("feat-1");
  });

  it("loads git log in parallel", async () => {
    const config = makeConfig(tmpDir);
    const result = await bootstrap(config);

    expect(result.gitLog).toHaveLength(1);
    expect(result.gitLog[0]).toBe("abc123 initial commit");
  });

  it("throws when git is unavailable", async () => {
    const { isGitAvailable } = await import("../git-ops.js");
    vi.mocked(isGitAvailable).mockResolvedValueOnce(false);

    const config = makeConfig(tmpDir);
    await expect(bootstrap(config)).rejects.toThrow(/GIT_UNAVAILABLE/);
  });

  it("throws when workspace is not a git repo", async () => {
    const { isGitRepo } = await import("../git-ops.js");
    vi.mocked(isGitRepo).mockResolvedValueOnce(false);

    const config = makeConfig(tmpDir);
    await expect(bootstrap(config)).rejects.toThrow(/GIT_UNAVAILABLE/);
  });

  it("throws when workspace does not exist", async () => {
    const config = makeConfig("/nonexistent/workspace/path");
    await expect(bootstrap(config)).rejects.toThrow(/WORKSPACE_INVALID/);
  });

  it("handles corrupted feature list gracefully (falls back to initializer)", async () => {
    const config = makeConfig(tmpDir);
    await fs.writeFile(path.join(tmpDir, config.featureListPath), "{ corrupted!!!");

    const result = await bootstrap(config);
    expect(result.mode).toBe("initializer");
    expect(result.featureList).toBeNull();
  });

  it("loads recent progress entries", async () => {
    const config = makeConfig(tmpDir);

    // Write progress file
    await fs.writeFile(
      path.join(tmpDir, config.progressFilePath),
      JSON.stringify({
        entries: [
          {
            sessionNumber: 1,
            timestamp: new Date().toISOString(),
            whatWasDone: "Init",
            currentState: "Started",
            nextSteps: "Continue",
            gitCommits: [],
            featuresCompleted: [],
          },
        ],
      }),
    );

    const result = await bootstrap(config);
    expect(result.recentProgress).toHaveLength(1);
    expect(result.recentProgress[0]?.sessionNumber).toBe(1);
  });
});
