import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureList } from "../feature-list.js";
import { ProgressFile } from "../progress-file.js";
import { createLongRunningTools } from "../tools.js";
import type { ResolvedLongRunningConfig, SessionBootstrapContext } from "../types.js";

// Mock git-ops
vi.mock("../git-ops.js", () => ({
  gitCommit: vi.fn().mockResolvedValue("abc123"),
  gitRevert: vi.fn().mockResolvedValue(undefined),
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

function makeCoderContext(
  overrides: Partial<SessionBootstrapContext> = {},
): SessionBootstrapContext {
  return {
    mode: "coder",
    featureList: null,
    recentProgress: [],
    gitLog: [],
    totalFeatures: 0,
    completedFeatures: 0,
    nextFeatures: [],
    ...overrides,
  };
}

function makeInitializerContext(
  overrides: Partial<SessionBootstrapContext> = {},
): SessionBootstrapContext {
  return {
    mode: "initializer",
    featureList: null,
    recentProgress: [],
    gitLog: [],
    totalFeatures: 0,
    completedFeatures: 0,
    nextFeatures: [],
    ...overrides,
  };
}

describe("createLongRunningTools", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join("/tmp", "tools-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("getFeatureList", () => {
    it("returns the feature list document", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeCoderContext(),
        features,
        ProgressFile.empty(),
      );

      const doc = await tools.getFeatureList();
      expect(doc.features).toHaveLength(1);
      expect(doc.features[0]?.id).toBe("feat-1");
    });

    it("throws when feature list is null", async () => {
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(config, makeCoderContext(), null, ProgressFile.empty());

      await expect(tools.getFeatureList()).rejects.toThrow(/not been created/);
    });
  });

  describe("updateFeatureStatus", () => {
    it("marks a feature as passing in coder mode", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeCoderContext(),
        features,
        ProgressFile.empty(),
      );

      await tools.updateFeatureStatus({
        featureId: "feat-1",
        testEvidence: "All unit tests pass",
      });

      // Verify persisted
      const doc = await tools.getFeatureList();
      expect(doc.features[0]?.passes).toBe(true);
    });

    it("rejects in initializer mode", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeInitializerContext(),
        features,
        ProgressFile.empty(),
      );

      await expect(
        tools.updateFeatureStatus({
          featureId: "feat-1",
          testEvidence: "Tests pass",
        }),
      ).rejects.toThrow(/initializer mode/);
    });

    it("rejects when exceeding maxActiveFeatures", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test 1",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
        {
          id: "feat-2",
          category: "functional",
          description: "Test 2",
          priority: 2,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeCoderContext(),
        features,
        ProgressFile.empty(),
      );

      // First one succeeds
      await tools.updateFeatureStatus({
        featureId: "feat-1",
        testEvidence: "Tests pass",
      });

      // Second one should fail (maxActiveFeatures = 1)
      await expect(
        tools.updateFeatureStatus({
          featureId: "feat-2",
          testEvidence: "Tests pass",
        }),
      ).rejects.toThrow(/more than 1 feature/);
    });

    it("rejects empty testEvidence", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeCoderContext(),
        features,
        ProgressFile.empty(),
      );

      await expect(
        tools.updateFeatureStatus({ featureId: "feat-1", testEvidence: "" }),
      ).rejects.toThrow(/testEvidence/);
    });

    it("rejects whitespace-only testEvidence", async () => {
      const features = FeatureList.create([
        {
          id: "feat-1",
          category: "functional",
          description: "Test",
          priority: 1,
          steps: ["Step 1"],
          passes: false,
        },
      ]);
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(
        config,
        makeCoderContext(),
        features,
        ProgressFile.empty(),
      );

      await expect(
        tools.updateFeatureStatus({ featureId: "feat-1", testEvidence: "   " }),
      ).rejects.toThrow(/testEvidence/);
    });
  });

  describe("updateProgress", () => {
    it("appends a progress entry with auto session number and timestamp", async () => {
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(config, makeCoderContext(), null, ProgressFile.empty());

      await tools.updateProgress({
        whatWasDone: "Set up project",
        currentState: "Ready",
        nextSteps: "Implement features",
        gitCommits: ["abc123"],
        featuresCompleted: [],
      });

      // Verify the progress was saved
      const filePath = path.join(tmpDir, config.progressFilePath);
      const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(raw.entries).toHaveLength(1);
      expect(raw.entries[0].sessionNumber).toBe(1);
      expect(raw.entries[0].whatWasDone).toBe("Set up project");
    });
  });

  describe("getSessionContext", () => {
    it("returns the bootstrap context", () => {
      const config = makeConfig(tmpDir);
      const context = makeCoderContext({ totalFeatures: 5 });
      const tools = createLongRunningTools(config, context, null, ProgressFile.empty());

      const result = tools.getSessionContext();
      expect(result.mode).toBe("coder");
      expect(result.totalFeatures).toBe(5);
    });
  });

  describe("gitCommit", () => {
    it("delegates to gitOps.gitCommit", async () => {
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(config, makeCoderContext(), null, ProgressFile.empty());

      const sha = await tools.gitCommit({
        files: ["src/index.ts"],
        message: "feat: add feature",
      });

      expect(sha).toBe("abc123");
    });
  });

  describe("gitRevert", () => {
    it("delegates to gitOps.gitRevert", async () => {
      const config = makeConfig(tmpDir);
      const tools = createLongRunningTools(config, makeCoderContext(), null, ProgressFile.empty());

      await expect(tools.gitRevert("abc123")).resolves.toBeUndefined();
    });
  });
});
