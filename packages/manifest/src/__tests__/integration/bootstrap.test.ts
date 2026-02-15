import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveBootstrapFiles,
  DEFAULT_BUDGET,
  BOOTSTRAP_FILENAMES,
} from "../../bootstrap-resolver.js";

const FIXTURES = resolve(
  import.meta.dirname,
  "../fixtures/bootstrap",
);

describe("bootstrap integration (real fixtures)", () => {
  it("resolves minimal fixture (TEMPLAR.md only)", async () => {
    const ctx = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "minimal"),
    });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.kind).toBe("instructions");
    expect(ctx.files[0]!.content).toContain("minimal Templar agent");
    expect(ctx.files[0]!.truncated).toBe(false);
    expect(ctx.resolvedFrom).toBe(resolve(FIXTURES, "minimal"));
  });

  it("resolves full fixture (all 3 files)", async () => {
    const ctx = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "full"),
    });

    expect(ctx.files).toHaveLength(3);
    expect(ctx.files.map((f) => f.kind)).toEqual([
      "instructions",
      "tools",
      "context",
    ]);
    expect(ctx.totalSize).toBeGreaterThan(0);

    // Verify content was actually read
    expect(ctx.files[0]!.content).toContain("full Templar agent");
    expect(ctx.files[1]!.content).toContain("web_search");
    expect(ctx.files[2]!.content).toContain("Project: Templar");
  });

  it("truncates oversized fixture", async () => {
    const ctx = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "oversized"),
    });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.truncated).toBe(true);
    expect(ctx.files[0]!.originalSize).toBeGreaterThan(
      DEFAULT_BUDGET.instructions,
    );
    expect(ctx.files[0]!.content.length).toBeLessThanOrEqual(
      DEFAULT_BUDGET.instructions,
    );
  });

  it("returns frozen output", async () => {
    const ctx = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "full"),
    });

    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.files)).toBe(true);
    for (const file of ctx.files) {
      expect(Object.isFrozen(file)).toBe(true);
    }
  });

  it("content hashes are deterministic across calls", async () => {
    const ctx1 = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "full"),
    });
    const ctx2 = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "full"),
    });

    for (let i = 0; i < ctx1.files.length; i++) {
      expect(ctx1.files[i]!.contentHash).toBe(ctx2.files[i]!.contentHash);
    }
  });

  it("dark templar loads only instructions from full fixture", async () => {
    const ctx = await resolveBootstrapFiles({
      manifestDir: resolve(FIXTURES, "full"),
      agentType: "dark",
    });

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.kind).toBe("instructions");
  });

  it("exports DEFAULT_BUDGET and BOOTSTRAP_FILENAMES", () => {
    expect(DEFAULT_BUDGET).toEqual({
      instructions: 10_000,
      tools: 6_000,
      context: 4_000,
    });
    expect(BOOTSTRAP_FILENAMES).toEqual({
      instructions: "TEMPLAR.md",
      tools: "TOOLS.md",
      context: "CONTEXT.md",
    });
  });
});
