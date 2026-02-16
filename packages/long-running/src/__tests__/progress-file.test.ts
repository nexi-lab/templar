import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressFile } from "../progress-file.js";
import type { ProgressEntry, ResolvedLongRunningConfig } from "../types.js";

function makeEntry(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    sessionNumber: 1,
    timestamp: new Date().toISOString(),
    whatWasDone: "Implemented login",
    currentState: "Login works",
    nextSteps: "Add validation",
    gitCommits: ["abc123"],
    featuresCompleted: ["feat-1"],
    ...overrides,
  };
}

function makeConfig(
  workspace: string,
  overrides: Partial<ResolvedLongRunningConfig> = {},
): ResolvedLongRunningConfig {
  return {
    workspace,
    maxActiveFeatures: 1,
    progressWindowSize: 10,
    gitTimeoutMs: 30_000,
    featureListPath: "feature-list.json",
    progressFilePath: "progress.json",
    progressArchivePath: "progress-archive.json",
    initScriptPath: "init.sh",
    ...overrides,
  };
}

describe("ProgressFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join("/tmp", "progress-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a new empty progress file", () => {
    const pf = ProgressFile.empty();
    expect(pf.entries).toHaveLength(0);
    expect(pf.latestSession).toBeNull();
    expect(pf.sessionCount).toBe(0);
  });

  it("appends an entry and returns a new instance", () => {
    const pf = ProgressFile.empty();
    const entry = makeEntry();
    const updated = pf.append(entry);

    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0]?.sessionNumber).toBe(1);
    // Original unchanged
    expect(pf.entries).toHaveLength(0);
  });

  it("reads entries after load", async () => {
    const config = makeConfig(tmpDir);
    const pf = ProgressFile.empty()
      .append(makeEntry({ sessionNumber: 1 }))
      .append(makeEntry({ sessionNumber: 2 }));

    await pf.save(tmpDir, config);

    const loaded = await ProgressFile.load(tmpDir, config);
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.latestSession?.sessionNumber).toBe(2);
  });

  it("enforces rolling window keeping last N entries", async () => {
    const config = makeConfig(tmpDir, { progressWindowSize: 3 });
    let pf = ProgressFile.empty();

    for (let i = 1; i <= 5; i++) {
      pf = pf.append(makeEntry({ sessionNumber: i, whatWasDone: `Session ${i}` }));
    }

    await pf.save(tmpDir, config);

    // Active file should have last 3
    const loaded = await ProgressFile.load(tmpDir, config);
    expect(loaded.entries).toHaveLength(3);
    expect(loaded.entries[0]?.sessionNumber).toBe(3);
    expect(loaded.entries[2]?.sessionNumber).toBe(5);

    // Archive should have first 2
    const archivePath = path.join(tmpDir, config.progressArchivePath);
    const archive = JSON.parse(await fs.readFile(archivePath, "utf-8"));
    expect(archive.entries).toHaveLength(2);
    expect(archive.entries[0].sessionNumber).toBe(1);
  });

  it("handles missing file by returning empty", async () => {
    const config = makeConfig(tmpDir);
    const loaded = await ProgressFile.load(tmpDir, config);
    expect(loaded.entries).toHaveLength(0);
  });

  it("handles corrupted file by returning empty", async () => {
    const config = makeConfig(tmpDir);
    await fs.writeFile(path.join(tmpDir, config.progressFilePath), "{ broken json !!!");

    const loaded = await ProgressFile.load(tmpDir, config);
    expect(loaded.entries).toHaveLength(0);
  });

  it("latestSession returns the last entry", () => {
    const pf = ProgressFile.empty()
      .append(makeEntry({ sessionNumber: 1 }))
      .append(makeEntry({ sessionNumber: 2 }))
      .append(makeEntry({ sessionNumber: 3 }));

    expect(pf.latestSession?.sessionNumber).toBe(3);
  });

  it("sessionCount matches entries length", () => {
    const pf = ProgressFile.empty()
      .append(makeEntry({ sessionNumber: 1 }))
      .append(makeEntry({ sessionNumber: 2 }));

    expect(pf.sessionCount).toBe(2);
  });

  it("save creates the file if it does not exist", async () => {
    const config = makeConfig(tmpDir);
    const pf = ProgressFile.empty().append(makeEntry());

    await pf.save(tmpDir, config);

    const exists = await fs
      .stat(path.join(tmpDir, config.progressFilePath))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("appends to archive on subsequent saves", async () => {
    const config = makeConfig(tmpDir, { progressWindowSize: 2 });

    // First save: 3 entries, window 2
    let pf = ProgressFile.empty();
    for (let i = 1; i <= 3; i++) {
      pf = pf.append(makeEntry({ sessionNumber: i }));
    }
    await pf.save(tmpDir, config);

    // Second save: 2 more entries
    let pf2 = await ProgressFile.load(tmpDir, config);
    pf2 = pf2.append(makeEntry({ sessionNumber: 4 }));
    pf2 = pf2.append(makeEntry({ sessionNumber: 5 }));
    await pf2.save(tmpDir, config);

    const loaded = await ProgressFile.load(tmpDir, config);
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.entries[0]?.sessionNumber).toBe(4);

    const archivePath = path.join(tmpDir, config.progressArchivePath);
    const archive = JSON.parse(await fs.readFile(archivePath, "utf-8"));
    // First archive had session 1, second adds 2 and 3
    expect(archive.entries.length).toBeGreaterThanOrEqual(3);
  });
});
