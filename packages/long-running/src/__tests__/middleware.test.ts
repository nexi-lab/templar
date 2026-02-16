import { execFile as execFileCb } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SessionContext } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LongRunningMiddleware } from "../middleware.js";
import type { Feature, FeatureListDocument } from "../types.js";

function exec(cmd: string, args: string[], opts: { cwd: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, opts, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

function makeSessionContext(id = "test-session"): SessionContext {
  return { sessionId: id };
}

function makeFeatures(): Feature[] {
  return [
    {
      id: "feat-1",
      category: "functional",
      description: "Add authentication",
      priority: 1,
      steps: ["Create login form", "Add JWT validation"],
      passes: false,
    },
    {
      id: "feat-2",
      category: "functional",
      description: "Add dashboard",
      priority: 2,
      steps: ["Create layout", "Add data widgets"],
      passes: false,
    },
    {
      id: "feat-3",
      category: "infrastructure",
      description: "CI/CD pipeline",
      priority: 3,
      steps: ["Add GitHub Actions", "Add deployment"],
      passes: false,
    },
  ];
}

describe("LongRunningMiddleware", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join("/tmp", "middleware-test-"));
    // Init a real git repo
    await exec("git", ["init"], { cwd: tmpDir });
    await exec("git", ["config", "user.email", "test@test.com"], {
      cwd: tmpDir,
    });
    await exec("git", ["config", "user.name", "Test"], { cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Test\n");
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Construction
  // ============================================================================

  it("validates config on construction", () => {
    expect(() => new LongRunningMiddleware({ workspace: "" })).toThrow();
  });

  it("resolves defaults correctly", () => {
    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    const config = mw.getConfig();
    expect(config.maxActiveFeatures).toBe(1);
    expect(config.progressWindowSize).toBe(10);
    expect(config.gitTimeoutMs).toBe(30_000);
  });

  // ============================================================================
  // Session 1: Initializer mode
  // ============================================================================

  it("detects initializer mode when no feature list exists", async () => {
    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    const ctx = mw.getBootstrapContext();
    expect(ctx?.mode).toBe("initializer");
    expect(ctx?.featureList).toBeNull();
  });

  it("returns initializer prompt", async () => {
    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    const prompt = mw.getSystemPrompt();
    expect(prompt).toContain("Initializer Mode");
  });

  // ============================================================================
  // Session 2: Coder mode
  // ============================================================================

  it("detects coder mode when feature list exists", async () => {
    // Create feature list file first
    const features = makeFeatures();
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add feature list"], { cwd: tmpDir });

    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    const ctx = mw.getBootstrapContext();
    expect(ctx?.mode).toBe("coder");
    expect(ctx?.totalFeatures).toBe(3);
    expect(ctx?.completedFeatures).toBe(0);
  });

  it("returns coder prompt with progress summary", async () => {
    const features = makeFeatures();
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add feature list"], { cwd: tmpDir });

    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    const prompt = mw.getSystemPrompt();
    expect(prompt).toContain("Coder Mode");
    expect(prompt).toContain("0/3 features passing");
  });

  // ============================================================================
  // Multi-session lifecycle simulation
  // ============================================================================

  it("simulates a 3-session lifecycle", async () => {
    // === SESSION 1: Initializer mode ===
    const mw1 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw1.onSessionStart(makeSessionContext("session-1"));

    expect(mw1.getBootstrapContext()?.mode).toBe("initializer");

    // Simulate agent creating feature list
    const features = makeFeatures();
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));

    // Update progress
    const tools1 = mw1.getTools();
    await tools1.updateProgress({
      whatWasDone: "Created feature list with 3 features",
      currentState: "Feature list ready, no features implemented",
      nextSteps: "Start implementing feat-1",
      gitCommits: [],
      featuresCompleted: [],
    });

    // Commit
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "feat: init project"], { cwd: tmpDir });

    await mw1.onSessionEnd(makeSessionContext("session-1"));

    // === SESSION 2: Coder mode, implement feat-1 ===
    const mw2 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw2.onSessionStart(makeSessionContext("session-2"));

    expect(mw2.getBootstrapContext()?.mode).toBe("coder");
    expect(mw2.getBootstrapContext()?.totalFeatures).toBe(3);

    const tools2 = mw2.getTools();

    // Mark feat-1 as passing
    await tools2.updateFeatureStatus({
      featureId: "feat-1",
      testEvidence: "Login form renders, JWT validates, tests pass",
    });

    // Update progress
    await tools2.updateProgress({
      whatWasDone: "Implemented authentication (feat-1)",
      currentState: "1/3 features passing",
      nextSteps: "Implement feat-2 (dashboard)",
      gitCommits: [],
      featuresCompleted: ["feat-1"],
    });

    await mw2.onSessionEnd(makeSessionContext("session-2"));

    // === SESSION 3: Coder mode, verify incremental progress ===
    const mw3 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw3.onSessionStart(makeSessionContext("session-3"));

    const ctx3 = mw3.getBootstrapContext();
    expect(ctx3?.mode).toBe("coder");
    expect(ctx3?.totalFeatures).toBe(3);
    expect(ctx3?.completedFeatures).toBe(1);
    expect(ctx3?.nextFeatures[0]?.id).toBe("feat-2");

    // Progress should have 2 entries
    expect(ctx3?.recentProgress).toHaveLength(2);
    expect(ctx3?.recentProgress[0]?.sessionNumber).toBe(1);
    expect(ctx3?.recentProgress[1]?.sessionNumber).toBe(2);

    await mw3.onSessionEnd(makeSessionContext("session-3"));
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  it("throws when workspace is invalid", async () => {
    const mw = new LongRunningMiddleware({ workspace: "/nonexistent/path" });
    await expect(mw.onSessionStart(makeSessionContext())).rejects.toThrow(/WORKSPACE_INVALID/);
  });

  it("throws when getting tools before onSessionStart", () => {
    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    expect(() => mw.getTools()).toThrow(/onSessionStart/);
  });

  it("throws when getting prompt before onSessionStart", () => {
    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    expect(() => mw.getSystemPrompt()).toThrow(/onSessionStart/);
  });

  it("handles corrupted feature list gracefully", async () => {
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), "{ corrupted !!!");
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add corrupted file"], { cwd: tmpDir });

    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    // Should fall back to initializer mode
    expect(mw.getBootstrapContext()?.mode).toBe("initializer");
  });

  it("enforces one-feature-per-session via tools", async () => {
    // Set up coder mode with 2 features
    const features = makeFeatures().slice(0, 2);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add features"], { cwd: tmpDir });

    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext());

    const tools = mw.getTools();

    // First feature passes
    await tools.updateFeatureStatus({
      featureId: "feat-1",
      testEvidence: "Tests pass",
    });

    // Second feature should be rejected
    await expect(
      tools.updateFeatureStatus({
        featureId: "feat-2",
        testEvidence: "Tests pass",
      }),
    ).rejects.toThrow(/more than 1 feature/);
  });
});
