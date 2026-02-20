import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalResolver } from "../../local-resolver.js";
import { SkillRegistry } from "../../registry.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(__dirname, "../fixtures");

describe("Skill lifecycle integration", () => {
  it("discovers, lists, and loads skills end-to-end", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });

    // Step 1: Discover
    const count = await registry.discover();
    expect(count).toBeGreaterThanOrEqual(4);

    // Step 2: List metadata (lightweight)
    const allMetadata = registry.listMetadata();
    expect(allMetadata.length).toBe(count);

    const names = allMetadata.map((m) => m.name);
    expect(names).toContain("valid-skill");
    expect(names).toContain("full-skill");
    expect(names).toContain("with-scripts");
    expect(names).toContain("with-references");

    // Step 3: Check has()
    expect(registry.has("valid-skill")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);

    // Step 4: Get metadata only (progressive disclosure)
    const metadata = registry.getMetadata("full-skill");
    expect(metadata).toBeDefined();
    expect(metadata?.license).toBe("Apache-2.0");
    expect(metadata?.allowedTools).toBe("Bash(git:*) Read Write");

    // Step 5: Load full content
    const skill = await registry.load("valid-skill");
    expect(skill).toBeDefined();
    expect(skill?.metadata.name).toBe("valid-skill");
    expect(skill?.content).toContain("# Valid Skill");
    expect(skill?.filePath).toContain("valid-skill/SKILL.md");

    // Step 6: Second load is cached
    const cachedSkill = await registry.load("valid-skill");
    expect(cachedSkill).toBe(skill); // Same reference

    // Step 7: Clear and verify empty
    registry.clear();
    expect(registry.listMetadata()).toEqual([]);
    expect(registry.has("valid-skill")).toBe(false);

    // Step 8: Re-discover
    const recount = await registry.discover();
    expect(recount).toBe(count);
  });

  it("invalid skills are silently skipped during discovery", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });

    await registry.discover();
    const names = registry.listMetadata().map((m) => m.name);

    // invalid-name fixture should be skipped (uppercase name)
    expect(names).not.toContain("Invalid-Name");
    expect(names).not.toContain("invalid-name");
  });

  it("load returns undefined for non-discovered skill", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });
    await registry.discover();

    const result = await registry.load("does-not-exist");
    expect(result).toBeUndefined();
  });

  it("3-level lifecycle: discover → load → loadResource → cache verification", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });

    // Level 1: Discover metadata
    const count = await registry.discover();
    expect(count).toBeGreaterThanOrEqual(5);
    expect(registry.has("with-scripts")).toBe(true);
    expect(registry.has("with-assets")).toBe(true);

    // Level 2: Load full content
    const skill = await registry.load("with-scripts");
    expect(skill).toBeDefined();
    expect(skill?.content).toContain("scripts/extract.py");

    // Level 3: Load bundled resource
    const resource = await registry.loadResource("with-scripts", "scripts/extract.py");
    expect(resource).toBeDefined();
    expect(resource?.category).toBe("script");
    expect(resource?.content).toContain("extracted");

    // Verify cache stats across all levels
    const stats = registry.cacheStats();
    expect(stats.metadata.size).toBe(count);
    expect(stats.content.size).toBe(1);
    expect(stats.resources.size).toBe(1);
  });

  it("cache stats reflect operations across all levels", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });

    // Initial: all empty
    let stats = registry.cacheStats();
    expect(stats.metadata.size).toBe(0);
    expect(stats.content.size).toBe(0);
    expect(stats.resources.size).toBe(0);

    // After discover
    await registry.discover();
    stats = registry.cacheStats();
    expect(stats.metadata.size).toBeGreaterThanOrEqual(4);

    // After loading content
    await registry.load("valid-skill");
    await registry.load("full-skill");
    stats = registry.cacheStats();
    expect(stats.content.size).toBe(2);

    // After loading resources
    await registry.loadResource("with-scripts", "scripts/extract.py");
    await registry.loadResource("with-assets", "assets/logo.txt");
    stats = registry.cacheStats();
    expect(stats.resources.size).toBe(2);
  });

  it("resource not found for nonexistent file", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry({ resolvers: [resolver] });
    await registry.discover();

    const result = await registry.loadResource("with-scripts", "scripts/nonexistent.py");
    expect(result).toBeUndefined();
  });
});
