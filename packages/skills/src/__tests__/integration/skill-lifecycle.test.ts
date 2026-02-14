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
    const registry = new SkillRegistry([resolver]);

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
    const registry = new SkillRegistry([resolver]);

    await registry.discover();
    const names = registry.listMetadata().map((m) => m.name);

    // invalid-name fixture should be skipped (uppercase name)
    expect(names).not.toContain("Invalid-Name");
    expect(names).not.toContain("invalid-name");
  });

  it("load returns undefined for non-discovered skill", async () => {
    const resolver = new LocalResolver([FIXTURES]);
    const registry = new SkillRegistry([resolver]);
    await registry.discover();

    const result = await registry.load("does-not-exist");
    expect(result).toBeUndefined();
  });
});
