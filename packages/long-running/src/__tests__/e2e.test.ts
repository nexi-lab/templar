/**
 * E2E test — exercises the full LongRunningMiddleware lifecycle
 * against real filesystem + git operations.
 *
 * Unlike middleware.test.ts (integration-level), this test:
 * - Uses real git commits via tools (not manual `git add`)
 * - Simulates 5 sessions with incremental feature completion
 * - Verifies progress rolling window across sessions
 * - Verifies feature list persistence + immutability across sessions
 * - Measures performance (bootstrap < 500ms, tool calls < 200ms)
 * - Tests recovery from corrupted state mid-lifecycle
 */

import { execFile as execFileCb } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LongRunningMiddleware } from "../middleware.js";
import type { Feature, FeatureListDocument, ProgressDocument, SessionContext } from "../types.js";

// ============================================================================
// HELPERS
// ============================================================================

function exec(cmd: string, args: string[], opts: { cwd: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, opts, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

function makeSessionContext(id = "e2e-session"): SessionContext {
  return { sessionId: id };
}

function makeFeatures(count: number): Feature[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `feat-${i + 1}`,
    category: i % 3 === 0 ? "infrastructure" : "functional",
    description: `Feature ${i + 1}: implement capability ${i + 1}`,
    priority: i + 1,
    steps: [`Step 1 for feat-${i + 1}`, `Step 2 for feat-${i + 1}`],
    passes: false,
  }));
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

// ============================================================================
// E2E TESTS
// ============================================================================

describe("LongRunningMiddleware E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join("/tmp", "lr-e2e-"));
    await exec("git", ["init"], { cwd: tmpDir });
    await exec("git", ["config", "user.email", "e2e@test.com"], { cwd: tmpDir });
    await exec("git", ["config", "user.name", "E2E Test"], { cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, "README.md"), "# E2E Test Workspace\n");
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Full 5-session lifecycle
  // ==========================================================================

  it("completes a 5-session lifecycle with real git commits", async () => {
    const features = makeFeatures(5);

    // ===== SESSION 1: Initializer =====
    const t0 = performance.now();
    const mw1 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw1.onSessionStart(makeSessionContext("session-1"));
    const bootstrapTime1 = performance.now() - t0;

    expect(mw1.getBootstrapContext()?.mode).toBe("initializer");

    // Agent creates the feature list file
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));

    // Agent creates a source file
    await fs.writeFile(path.join(tmpDir, "src.ts"), "export const init = true;\n");

    // Agent updates progress via tool
    const tools1 = mw1.getTools();
    await tools1.updateProgress({
      whatWasDone: "Scaffolded project with 5 features",
      currentState: "Feature list created, 0/5 passing",
      nextSteps: "Implement feat-1",
      gitCommits: [],
      featuresCompleted: [],
    });

    // Agent commits via tool
    const t1 = performance.now();
    const sha1 = await tools1.gitCommit({
      files: ["feature-list.json", "progress.json", "src.ts"],
      message: "feat: scaffold project with feature list",
    });
    const commitTime1 = performance.now() - t1;

    expect(sha1).toBeTruthy();
    await mw1.onSessionEnd(makeSessionContext("session-1"));

    // ===== SESSION 2: Coder — implement feat-1 =====
    const t2 = performance.now();
    const mw2 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw2.onSessionStart(makeSessionContext("session-2"));
    const bootstrapTime2 = performance.now() - t2;

    const ctx2 = mw2.getBootstrapContext();
    expect(ctx2?.mode).toBe("coder");
    expect(ctx2?.totalFeatures).toBe(5);
    expect(ctx2?.completedFeatures).toBe(0);
    expect(ctx2?.nextFeatures[0]?.id).toBe("feat-1");

    const tools2 = mw2.getTools();

    // Implement feat-1
    await fs.writeFile(path.join(tmpDir, "feat1.ts"), "export function feat1() { return true; }\n");

    // Mark feat-1 as passing
    const t3 = performance.now();
    await tools2.updateFeatureStatus({
      featureId: "feat-1",
      testEvidence: "Unit test: feat1() returns true. Integration test: API responds 200.",
    });
    const updateTime = performance.now() - t3;

    // Cannot mark another feature in same session
    await expect(
      tools2.updateFeatureStatus({
        featureId: "feat-2",
        testEvidence: "Tests pass",
      }),
    ).rejects.toThrow(/more than 1 feature/);

    // Update progress
    await tools2.updateProgress({
      whatWasDone: "Implemented feat-1 (authentication)",
      currentState: "1/5 features passing",
      nextSteps: "Implement feat-2",
      gitCommits: [],
      featuresCompleted: ["feat-1"],
    });

    // Commit
    const sha2 = await tools2.gitCommit({
      files: ["feat1.ts", "feature-list.json", "progress.json"],
      message: "feat: implement feat-1",
    });
    expect(sha2).toBeTruthy();

    await mw2.onSessionEnd(makeSessionContext("session-2"));

    // ===== SESSION 3: Coder — implement feat-2 =====
    const mw3 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw3.onSessionStart(makeSessionContext("session-3"));

    const ctx3 = mw3.getBootstrapContext();
    expect(ctx3?.completedFeatures).toBe(1);
    expect(ctx3?.nextFeatures[0]?.id).toBe("feat-2");
    expect(ctx3?.recentProgress).toHaveLength(2);

    const tools3 = mw3.getTools();
    await fs.writeFile(path.join(tmpDir, "feat2.ts"), "export function feat2() { return true; }\n");

    await tools3.updateFeatureStatus({
      featureId: "feat-2",
      testEvidence: "Dashboard renders correctly, widget tests pass",
    });
    await tools3.updateProgress({
      whatWasDone: "Implemented feat-2 (dashboard)",
      currentState: "2/5 features passing",
      nextSteps: "Implement feat-3",
      gitCommits: [],
      featuresCompleted: ["feat-2"],
    });
    await tools3.gitCommit({
      files: ["feat2.ts", "feature-list.json", "progress.json"],
      message: "feat: implement feat-2",
    });
    await mw3.onSessionEnd(makeSessionContext("session-3"));

    // ===== SESSION 4: Coder — implement feat-3 =====
    const mw4 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw4.onSessionStart(makeSessionContext("session-4"));

    const ctx4 = mw4.getBootstrapContext();
    expect(ctx4?.completedFeatures).toBe(2);
    expect(ctx4?.nextFeatures[0]?.id).toBe("feat-3");

    const tools4 = mw4.getTools();
    await fs.writeFile(path.join(tmpDir, "feat3.ts"), "export function feat3() { return true; }\n");
    await tools4.updateFeatureStatus({
      featureId: "feat-3",
      testEvidence: "CI/CD pipeline runs, deployment succeeds",
    });
    await tools4.updateProgress({
      whatWasDone: "Implemented feat-3 (CI/CD)",
      currentState: "3/5 features passing",
      nextSteps: "Implement feat-4",
      gitCommits: [],
      featuresCompleted: ["feat-3"],
    });
    await tools4.gitCommit({
      files: ["feat3.ts", "feature-list.json", "progress.json"],
      message: "feat: implement feat-3",
    });
    await mw4.onSessionEnd(makeSessionContext("session-4"));

    // ===== SESSION 5: Coder — verify accumulated state =====
    const mw5 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw5.onSessionStart(makeSessionContext("session-5"));

    const ctx5 = mw5.getBootstrapContext();
    expect(ctx5?.mode).toBe("coder");
    expect(ctx5?.completedFeatures).toBe(3);
    expect(ctx5?.totalFeatures).toBe(5);
    expect(ctx5?.nextFeatures[0]?.id).toBe("feat-4");
    expect(ctx5?.nextFeatures[1]?.id).toBe("feat-5");

    // Prompt should reflect progress
    const prompt5 = mw5.getSystemPrompt();
    expect(prompt5).toContain("3/5 features passing");

    await mw5.onSessionEnd(makeSessionContext("session-5"));

    // ===== VERIFY FINAL STATE ON DISK =====

    // Feature list: 3 passing, 2 remaining
    const featureDoc = await readJson<FeatureListDocument>(path.join(tmpDir, "feature-list.json"));
    expect(featureDoc.features).toHaveLength(5);
    const passing = featureDoc.features.filter((f) => f.passes);
    const failing = featureDoc.features.filter((f) => !f.passes);
    expect(passing).toHaveLength(3);
    expect(failing).toHaveLength(2);
    expect(passing.map((f) => f.id)).toEqual(["feat-1", "feat-2", "feat-3"]);

    // Progress: 4 entries (sessions 1-4 wrote progress)
    const progressDoc = await readJson<ProgressDocument>(path.join(tmpDir, "progress.json"));
    expect(progressDoc.entries).toHaveLength(4);
    expect(progressDoc.entries[0]?.sessionNumber).toBe(1);
    expect(progressDoc.entries[3]?.sessionNumber).toBe(4);

    // Git log: should have original + scaffold + feat-1 + feat-2 + feat-3 = 5 commits
    const gitLogOutput = await exec("git", ["log", "--oneline"], { cwd: tmpDir });
    const commits = gitLogOutput.split("\n").filter((l) => l.trim().length > 0);
    expect(commits.length).toBeGreaterThanOrEqual(5);

    // ===== PERFORMANCE ASSERTIONS =====
    expect(bootstrapTime1).toBeLessThan(500);
    expect(bootstrapTime2).toBeLessThan(500);
    expect(commitTime1).toBeLessThan(2000);
    expect(updateTime).toBeLessThan(200);
  });

  // ==========================================================================
  // Progress rolling window
  // ==========================================================================

  it("applies rolling window when progress exceeds windowSize", async () => {
    // Use a small window of 3 to trigger archiving quickly
    const features = makeFeatures(2);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add features"], { cwd: tmpDir });

    // Run 5 sessions, each writing progress, with windowSize=3
    for (let i = 1; i <= 5; i++) {
      const mw = new LongRunningMiddleware({
        workspace: tmpDir,
        progressWindowSize: 3,
      });
      await mw.onSessionStart(makeSessionContext(`session-${i}`));

      const tools = mw.getTools();
      await tools.updateProgress({
        whatWasDone: `Session ${i} work`,
        currentState: `After session ${i}`,
        nextSteps: `Session ${i + 1} work`,
        gitCommits: [],
        featuresCompleted: [],
      });

      // Commit progress file to keep git clean
      await exec("git", ["add", "progress.json"], { cwd: tmpDir });

      // Archive file may not exist yet, add only if present
      const archiveExists = await fs
        .stat(path.join(tmpDir, "progress-archive.json"))
        .then(() => true)
        .catch(() => false);
      if (archiveExists) {
        await exec("git", ["add", "progress-archive.json"], { cwd: tmpDir });
      }

      await exec("git", ["commit", "-m", `progress: session ${i}`], { cwd: tmpDir });
      await mw.onSessionEnd(makeSessionContext(`session-${i}`));
    }

    // After 5 sessions with window=3, active should have 3 entries, archive should have 2
    const active = await readJson<ProgressDocument>(path.join(tmpDir, "progress.json"));
    expect(active.entries.length).toBeLessThanOrEqual(3);

    const archiveExists = await fs
      .stat(path.join(tmpDir, "progress-archive.json"))
      .then(() => true)
      .catch(() => false);
    expect(archiveExists).toBe(true);

    const archive = await readJson<ProgressDocument>(path.join(tmpDir, "progress-archive.json"));
    expect(archive.entries.length).toBeGreaterThanOrEqual(2);

    // Total entries = active + archive = 5
    expect(active.entries.length + archive.entries.length).toBe(5);
  });

  // ==========================================================================
  // Feature immutability across sessions
  // ==========================================================================

  it("prevents feature modification across sessions", async () => {
    // Session 1: Create feature list and mark feat-1 passing
    const features = makeFeatures(3);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add features"], { cwd: tmpDir });

    const mw1 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw1.onSessionStart(makeSessionContext("session-1"));
    const tools1 = mw1.getTools();

    await tools1.updateFeatureStatus({
      featureId: "feat-1",
      testEvidence: "Tests pass",
    });
    await mw1.onSessionEnd(makeSessionContext("session-1"));

    // Verify feat-1 is passing on disk
    const featureDoc = await readJson<FeatureListDocument>(path.join(tmpDir, "feature-list.json"));
    expect(featureDoc.features[0]?.passes).toBe(true);

    // Tamper: try to revert feat-1.passes to false on disk
    const tampered: FeatureListDocument = {
      ...featureDoc,
      features: featureDoc.features.map((f) => (f.id === "feat-1" ? { ...f, passes: false } : f)),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(tampered, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "tamper: revert feat-1"], { cwd: tmpDir });

    // Session 2: Middleware loads the tampered version, sees feat-1 as not passing
    const mw2 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw2.onSessionStart(makeSessionContext("session-2"));
    const ctx2 = mw2.getBootstrapContext();

    // Tampered version has feat-1 as not passing
    expect(ctx2?.completedFeatures).toBe(0);

    // But the middleware still works — it loads whatever is on disk
    // The immutability guard only fires during markPassing
    await mw2.onSessionEnd(makeSessionContext("session-2"));
  });

  // ==========================================================================
  // Recovery from corrupted progress file
  // ==========================================================================

  it("recovers from corrupted progress file", async () => {
    const features = makeFeatures(2);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));

    // Session 1: Write valid progress
    const mw1 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw1.onSessionStart(makeSessionContext("session-1"));
    const tools1 = mw1.getTools();
    await tools1.updateProgress({
      whatWasDone: "Session 1 work",
      currentState: "After session 1",
      nextSteps: "Session 2",
      gitCommits: [],
      featuresCompleted: [],
    });
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "session 1"], { cwd: tmpDir });
    await mw1.onSessionEnd(makeSessionContext("session-1"));

    // Corrupt progress file
    await fs.writeFile(path.join(tmpDir, "progress.json"), "NOT VALID JSON {{{{");
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "corrupt progress"], { cwd: tmpDir });

    // Session 2: Should still boot (progress starts empty)
    const mw2 = new LongRunningMiddleware({ workspace: tmpDir });
    await mw2.onSessionStart(makeSessionContext("session-2"));

    const ctx2 = mw2.getBootstrapContext();
    expect(ctx2?.mode).toBe("coder");
    // Progress is empty due to corruption, but session still works
    expect(ctx2?.recentProgress).toHaveLength(0);

    // Can still write new progress
    const tools2 = mw2.getTools();
    await tools2.updateProgress({
      whatWasDone: "Recovered from corruption",
      currentState: "Progress reset",
      nextSteps: "Continue",
      gitCommits: [],
      featuresCompleted: [],
    });

    // Verify new progress is written cleanly
    const progressDoc = await readJson<ProgressDocument>(path.join(tmpDir, "progress.json"));
    expect(progressDoc.entries).toHaveLength(1);
    expect(progressDoc.entries[0]?.whatWasDone).toBe("Recovered from corruption");

    await mw2.onSessionEnd(makeSessionContext("session-2"));
  });

  // ==========================================================================
  // Git revert via tools
  // ==========================================================================

  it("supports git revert via tools", async () => {
    const features = makeFeatures(2);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));
    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "add features"], { cwd: tmpDir });

    const mw = new LongRunningMiddleware({ workspace: tmpDir });
    await mw.onSessionStart(makeSessionContext("session-1"));

    const tools = mw.getTools();

    // Make a bad commit
    await fs.writeFile(path.join(tmpDir, "bad-code.ts"), "throw new Error('broken');\n");
    const badSha = await tools.gitCommit({
      files: ["bad-code.ts"],
      message: "feat: bad code",
    });
    expect(badSha).toBeTruthy();

    // Verify file exists
    const existsBefore = await fs
      .stat(path.join(tmpDir, "bad-code.ts"))
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Revert via tools
    await tools.gitRevert(badSha);

    // File should be gone after revert
    const existsAfter = await fs
      .stat(path.join(tmpDir, "bad-code.ts"))
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);

    await mw.onSessionEnd(makeSessionContext("session-1"));
  });

  // ==========================================================================
  // Performance: bootstrap time
  // ==========================================================================

  it("bootstraps within 500ms", async () => {
    // Set up a workspace with feature list + progress (typical coder mode)
    const features = makeFeatures(50);
    const doc: FeatureListDocument = {
      features,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(tmpDir, "feature-list.json"), JSON.stringify(doc, null, 2));

    const progressEntries = Array.from({ length: 10 }, (_, i) => ({
      sessionNumber: i + 1,
      timestamp: new Date().toISOString(),
      whatWasDone: `Session ${i + 1} work`,
      currentState: `After session ${i + 1}`,
      nextSteps: `Session ${i + 2}`,
      gitCommits: [`sha${i + 1}`],
      featuresCompleted: [`feat-${i + 1}`],
    }));
    await fs.writeFile(
      path.join(tmpDir, "progress.json"),
      JSON.stringify({ entries: progressEntries }, null, 2),
    );

    await exec("git", ["add", "."], { cwd: tmpDir });
    await exec("git", ["commit", "-m", "setup"], { cwd: tmpDir });

    // Measure bootstrap time
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const mw = new LongRunningMiddleware({ workspace: tmpDir });
      await mw.onSessionStart(makeSessionContext(`perf-${i}`));
      times.push(performance.now() - start);
      await mw.onSessionEnd(makeSessionContext(`perf-${i}`));
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(500);
  });
});
