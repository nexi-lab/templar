import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { resolveBootstrapFiles, DEFAULT_BUDGET } from "../../bootstrap-resolver.js";
import {
  BOOTSTRAP_TEMPLAR_MD,
  BOOTSTRAP_TOOLS_MD,
  BOOTSTRAP_CONTEXT_MD,
  OVERSIZED_CONTENT,
} from "../helpers/fixtures.js";

describe("resolveBootstrapFiles", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `templar-bootstrap-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Helper: create a fresh subdirectory with optional files
  async function makeDir(
    name: string,
    files: Record<string, string> = {},
  ): Promise<string> {
    const sub = join(dir, name);
    await mkdir(sub, { recursive: true });
    for (const [fname, content] of Object.entries(files)) {
      await writeFile(join(sub, fname), content);
    }
    return sub;
  }

  // ---- Edge case 1: Happy path — all 3 files present ----
  it("resolves all 3 files for high templar", async () => {
    const d = await makeDir("happy", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
      "TOOLS.md": BOOTSTRAP_TOOLS_MD,
      "CONTEXT.md": BOOTSTRAP_CONTEXT_MD,
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files).toHaveLength(3);
    expect(ctx.files[0]!.kind).toBe("instructions");
    expect(ctx.files[1]!.kind).toBe("tools");
    expect(ctx.files[2]!.kind).toBe("context");
    expect(ctx.totalSize).toBeGreaterThan(0);
    expect(ctx.resolvedFrom).toBe(d);
  });

  // ---- Edge case 2: Partial — only TEMPLAR.md ----
  it("resolves partial: only TEMPLAR.md present", async () => {
    const d = await makeDir("partial", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.kind).toBe("instructions");
    expect(ctx.files[0]!.content).toBe(BOOTSTRAP_TEMPLAR_MD);
  });

  // ---- Edge case 3: No files — empty BootstrapContext ----
  it("returns empty context when no bootstrap files exist", async () => {
    const d = await makeDir("empty-dir");

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files).toHaveLength(0);
    expect(ctx.totalSize).toBe(0);
  });

  // ---- Edge case 4: Oversized TEMPLAR.md → truncated ----
  it("truncates oversized TEMPLAR.md", async () => {
    const d = await makeDir("oversized", {
      "TEMPLAR.md": OVERSIZED_CONTENT,
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.truncated).toBe(true);
    expect(ctx.files[0]!.originalSize).toBe(OVERSIZED_CONTENT.length);
    expect(ctx.files[0]!.content.length).toBeLessThanOrEqual(
      DEFAULT_BUDGET.instructions,
    );
  });

  // ---- Edge case 5: Oversized with custom budget ----
  it("respects custom budget overrides", async () => {
    const d = await makeDir("custom-budget", {
      "TEMPLAR.md": "x".repeat(500),
    });

    const ctx = await resolveBootstrapFiles({
      manifestDir: d,
      bootstrap: { budget: { instructions: 200 } },
    });

    expect(ctx.files[0]!.truncated).toBe(true);
    expect(ctx.files[0]!.content.length).toBeLessThanOrEqual(200);
  });

  // ---- Edge case 6: Binary file → BootstrapParseFailedError ----
  it("throws for binary files", async () => {
    const d = await makeDir("binary", {
      "TEMPLAR.md": "Hello\0World",
    });

    await expect(
      resolveBootstrapFiles({ manifestDir: d }),
    ).rejects.toThrow("File appears to be binary");
  });

  // ---- Edge case 7: Empty file → empty string, no error ----
  it("handles empty files gracefully", async () => {
    const d = await makeDir("empty-file", {
      "TEMPLAR.md": "",
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.content).toBe("");
    expect(ctx.files[0]!.originalSize).toBe(0);
    expect(ctx.files[0]!.truncated).toBe(false);
  });

  // ---- Edge case 8: BOM handling ----
  it("strips BOM from file content", async () => {
    const d = await makeDir("bom", {
      "TEMPLAR.md": "\uFEFF# Instructions with BOM",
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx.files[0]!.content).toBe("# Instructions with BOM");
    expect(ctx.files[0]!.content.charCodeAt(0)).not.toBe(0xfeff);
  });

  // ---- Edge case 9: Dark Templar → only instructions ----
  it("loads only instructions for dark templar", async () => {
    const d = await makeDir("dark", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
      "TOOLS.md": BOOTSTRAP_TOOLS_MD,
      "CONTEXT.md": BOOTSTRAP_CONTEXT_MD,
    });

    const ctx = await resolveBootstrapFiles({
      manifestDir: d,
      agentType: "dark",
    });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.kind).toBe("instructions");
  });

  // ---- Path traversal guard ----
  it("rejects paths that escape the manifest directory", async () => {
    const d = await makeDir("traversal");
    await expect(
      resolveBootstrapFiles({
        manifestDir: d,
        bootstrap: { instructions: "../../../etc/passwd" },
      }),
    ).rejects.toThrow("Bootstrap path escapes the manifest directory");
  });

  // ---- Edge case 10: Custom file paths ----
  it("resolves custom file paths from bootstrap config", async () => {
    const d = await makeDir("custom-paths", {
      "MY_AGENT.md": "Custom instructions",
      "MY_TOOLS.md": "Custom tools",
    });

    const ctx = await resolveBootstrapFiles({
      manifestDir: d,
      bootstrap: {
        instructions: "MY_AGENT.md",
        tools: "MY_TOOLS.md",
      },
    });

    expect(ctx.files).toHaveLength(2);
    expect(ctx.files[0]!.content).toBe("Custom instructions");
    expect(ctx.files[1]!.content).toBe("Custom tools");
  });

  // ---- Edge case 11: Symlink resolution ----
  it("follows symlinks", async () => {
    const src = await makeDir("symlink-src", {
      "TEMPLAR.md": "Symlinked content",
    });
    const link = join(dir, "symlink-link");
    try {
      await symlink(join(src, "TEMPLAR.md"), join(dir, "symlink-target.md"));
      await mkdir(link, { recursive: true });
      await symlink(
        join(dir, "symlink-target.md"),
        join(link, "TEMPLAR.md"),
      );
    } catch {
      // Symlinks may not be supported on all platforms
      return;
    }

    const ctx = await resolveBootstrapFiles({ manifestDir: link });

    expect(ctx.files.length).toBeGreaterThanOrEqual(1);
    expect(ctx.files[0]!.content).toBe("Symlinked content");
  });

  // ---- Edge case 12: Permission denied → error ----
  // Skipped in CI — requires platform-specific permission manipulation

  // ---- Content hash determinism ----
  it("produces deterministic content hashes", async () => {
    const d = await makeDir("hash", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
    });

    const ctx1 = await resolveBootstrapFiles({ manifestDir: d });
    const ctx2 = await resolveBootstrapFiles({ manifestDir: d });

    expect(ctx1.files[0]!.contentHash).toBe(ctx2.files[0]!.contentHash);
    expect(ctx1.files[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ---- Immutability ----
  it("returns deeply frozen context", async () => {
    const d = await makeDir("frozen", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.files)).toBe(true);
    expect(Object.isFrozen(ctx.files[0])).toBe(true);
  });

  // ---- Parallel reads (functional test) ----
  it("reads all 3 files concurrently", async () => {
    const d = await makeDir("parallel", {
      "TEMPLAR.md": BOOTSTRAP_TEMPLAR_MD,
      "TOOLS.md": BOOTSTRAP_TOOLS_MD,
      "CONTEXT.md": BOOTSTRAP_CONTEXT_MD,
    });

    const ctx = await resolveBootstrapFiles({ manifestDir: d });

    // All 3 files resolved
    expect(ctx.files).toHaveLength(3);
    expect(ctx.totalSize).toBe(
      BOOTSTRAP_TEMPLAR_MD.length +
        BOOTSTRAP_TOOLS_MD.length +
        BOOTSTRAP_CONTEXT_MD.length,
    );
  });
});
