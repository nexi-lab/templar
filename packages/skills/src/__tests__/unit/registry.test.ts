import { describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "../../registry.js";
import type { Skill, SkillResolver, SkillResource } from "../../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockResolver(
  name: string,
  skills: readonly Skill[],
  resources?: ReadonlyMap<string, SkillResource>,
): SkillResolver {
  return {
    name,
    discover: vi.fn(async () => skills.map((s) => s.metadata)),
    load: vi.fn(async (skillName: string) => skills.find((s) => s.metadata.name === skillName)),
    loadResource: resources
      ? vi.fn(async (skillName: string, relativePath: string) =>
          resources.get(`${skillName}:${relativePath}`),
        )
      : undefined,
  };
}

const SKILL_A: Skill = {
  metadata: { name: "skill-a", description: "Skill A description" },
  content: "# Skill A\n\nInstructions.",
  filePath: "/skills/skill-a/SKILL.md",
};

const SKILL_B: Skill = {
  metadata: {
    name: "skill-b",
    description: "Skill B description",
    license: "MIT",
    allowedTools: "Read Write",
  },
  content: "# Skill B",
  filePath: "/skills/skill-b/SKILL.md",
};

const SKILL_C: Skill = {
  metadata: { name: "skill-c", description: "Skill C from remote" },
  content: "# Skill C (remote)",
  filePath: "/remote/skill-c/SKILL.md",
};

const RESOURCE_SCRIPT: SkillResource = {
  skillName: "skill-a",
  relativePath: "scripts/extract.py",
  category: "script",
  content: "print('hello')",
  absolutePath: "/skills/skill-a/scripts/extract.py",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillRegistry", () => {
  describe("constructor", () => {
    it("creates a registry with options object", () => {
      const resolver = createMockResolver("test", []);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      expect(registry).toBeDefined();
    });

    it("creates a registry with no resolvers", () => {
      const registry = new SkillRegistry({ resolvers: [] });
      expect(registry).toBeDefined();
    });

    it("accepts custom cache configuration", () => {
      const resolver = createMockResolver("test", []);
      const registry = new SkillRegistry({
        resolvers: [resolver],
        cache: { maxContent: 5, maxResources: 10 },
      });
      expect(registry).toBeDefined();
      const stats = registry.cacheStats();
      expect(stats.content.max).toBe(5);
      expect(stats.resources.max).toBe(10);
    });

    it("uses default cache limits when not specified", () => {
      const registry = new SkillRegistry({ resolvers: [] });
      const stats = registry.cacheStats();
      expect(stats.content.max).toBe(100);
      expect(stats.resources.max).toBe(200);
    });
  });

  describe("discover", () => {
    it("discovers skills from a single resolver", async () => {
      const resolver = createMockResolver("local", [SKILL_A, SKILL_B]);
      const registry = new SkillRegistry({ resolvers: [resolver] });

      const count = await registry.discover();
      expect(count).toBe(2);
      expect(resolver.discover).toHaveBeenCalledOnce();
    });

    it("discovers skills from multiple resolvers", async () => {
      const local = createMockResolver("local", [SKILL_A]);
      const remote = createMockResolver("nexus", [SKILL_C]);
      const registry = new SkillRegistry({ resolvers: [local, remote] });

      const count = await registry.discover();
      expect(count).toBe(2);
      expect(local.discover).toHaveBeenCalledOnce();
      expect(remote.discover).toHaveBeenCalledOnce();
    });

    it("first resolver wins on name conflicts", async () => {
      const conflictSkill: Skill = {
        metadata: { name: "skill-a", description: "Conflicting skill A" },
        content: "Different",
        filePath: "/other/skill-a/SKILL.md",
      };
      const local = createMockResolver("local", [SKILL_A]);
      const remote = createMockResolver("nexus", [conflictSkill]);
      const registry = new SkillRegistry({ resolvers: [local, remote] });

      const count = await registry.discover();
      expect(count).toBe(1);

      const metadata = registry.getMetadata("skill-a");
      expect(metadata?.description).toBe("Skill A description");
    });

    it("returns 0 for empty resolvers", async () => {
      const registry = new SkillRegistry({ resolvers: [] });
      const count = await registry.discover();
      expect(count).toBe(0);
    });

    it("clears previous cache on re-discovery", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });

      await registry.discover();
      expect(registry.listMetadata()).toHaveLength(1);

      // Now resolver returns different skills
      vi.mocked(resolver.discover).mockResolvedValueOnce([SKILL_B.metadata]);
      await registry.discover();
      expect(registry.listMetadata()).toHaveLength(1);
      expect(registry.getMetadata("skill-b")).toBeDefined();
      expect(registry.getMetadata("skill-a")).toBeUndefined();
    });

    it("uses Promise.allSettled for parallel resolver discovery", async () => {
      const failResolver: SkillResolver = {
        name: "fail",
        discover: vi.fn(async () => {
          throw new Error("Resolver failed");
        }),
        load: vi.fn(async () => undefined),
      };
      const local = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [failResolver, local] });

      // Should not throw — failed resolver is skipped
      const count = await registry.discover();
      expect(count).toBe(1);
      expect(registry.has("skill-a")).toBe(true);
    });

    it("maintains first-wins across parallel resolvers", async () => {
      const resolver1 = createMockResolver("r1", [SKILL_A]);
      const resolver2 = createMockResolver("r2", [
        { ...SKILL_A, metadata: { ...SKILL_A.metadata, description: "From r2" } },
      ]);
      const registry = new SkillRegistry({ resolvers: [resolver1, resolver2] });

      await registry.discover();
      expect(registry.getMetadata("skill-a")?.description).toBe("Skill A description");
    });
  });

  describe("getMetadata", () => {
    it("returns metadata for discovered skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const metadata = registry.getMetadata("skill-a");
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe("skill-a");
      expect(metadata?.description).toBe("Skill A description");
    });

    it("returns undefined for unknown skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      expect(registry.getMetadata("unknown")).toBeUndefined();
    });
  });

  describe("listMetadata", () => {
    it("returns all discovered metadata", async () => {
      const resolver = createMockResolver("local", [SKILL_A, SKILL_B]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const list = registry.listMetadata();
      expect(list).toHaveLength(2);
      expect(list.map((m) => m.name).sort()).toEqual(["skill-a", "skill-b"]);
    });

    it("returns empty array before discovery", () => {
      const registry = new SkillRegistry({ resolvers: [] });
      expect(registry.listMetadata()).toEqual([]);
    });
  });

  describe("load", () => {
    it("loads full skill content from resolver", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const skill = await registry.load("skill-a");
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe("skill-a");
      expect(skill?.content).toContain("# Skill A");
      expect(resolver.load).toHaveBeenCalledWith("skill-a");
    });

    it("caches loaded skills", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      await registry.load("skill-a");
      await registry.load("skill-a");

      // load should only be called once (cached)
      expect(resolver.load).toHaveBeenCalledTimes(1);
    });

    it("returns undefined for undiscovered skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const skill = await registry.load("unknown");
      expect(skill).toBeUndefined();
    });

    it("loads from correct resolver in chain", async () => {
      const local = createMockResolver("local", [SKILL_A]);
      const remote = createMockResolver("nexus", [SKILL_C]);
      const registry = new SkillRegistry({ resolvers: [local, remote] });
      await registry.discover();

      const skill = await registry.load("skill-c");
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe("skill-c");
      expect(remote.load).toHaveBeenCalledWith("skill-c");
      expect(local.load).not.toHaveBeenCalled();
    });

    it("evicts LRU entries when cache is full", async () => {
      const skills = Array.from({ length: 5 }, (_, i) => ({
        metadata: { name: `skill-${i}`, description: `Skill ${i}` },
        content: `# Skill ${i}`,
        filePath: `/skills/skill-${i}/SKILL.md`,
      }));
      const resolver = createMockResolver("local", skills);
      const registry = new SkillRegistry({
        resolvers: [resolver],
        cache: { maxContent: 3 },
      });
      await registry.discover();

      // Load 5 skills into cache with max 3
      for (const skill of skills) {
        await registry.load(skill.metadata.name);
      }

      const stats = registry.cacheStats();
      expect(stats.content.size).toBe(3);
      expect(stats.content.max).toBe(3);
    });
  });

  describe("loadResource", () => {
    it("loads a resource from resolver with loadResource support", async () => {
      const resources = new Map<string, SkillResource>([
        ["skill-a:scripts/extract.py", RESOURCE_SCRIPT],
      ]);
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const resource = await registry.loadResource("skill-a", "scripts/extract.py");
      expect(resource).toBeDefined();
      expect(resource?.skillName).toBe("skill-a");
      expect(resource?.category).toBe("script");
      expect(resource?.content).toContain("hello");
    });

    it("caches loaded resources", async () => {
      const resources = new Map<string, SkillResource>([
        ["skill-a:scripts/extract.py", RESOURCE_SCRIPT],
      ]);
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      await registry.loadResource("skill-a", "scripts/extract.py");
      await registry.loadResource("skill-a", "scripts/extract.py");

      expect(resolver.loadResource).toHaveBeenCalledTimes(1);
    });

    it("uses composite key for resource cache", async () => {
      const resource2: SkillResource = {
        ...RESOURCE_SCRIPT,
        relativePath: "scripts/other.py",
        content: "other content",
      };
      const resources = new Map<string, SkillResource>([
        ["skill-a:scripts/extract.py", RESOURCE_SCRIPT],
        ["skill-a:scripts/other.py", resource2],
      ]);
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const r1 = await registry.loadResource("skill-a", "scripts/extract.py");
      const r2 = await registry.loadResource("skill-a", "scripts/other.py");

      expect(r1?.content).toContain("hello");
      expect(r2?.content).toBe("other content");
    });

    it("returns undefined for undiscovered skill", async () => {
      const registry = new SkillRegistry({ resolvers: [] });
      const result = await registry.loadResource("unknown", "scripts/test.py");
      expect(result).toBeUndefined();
    });

    it("returns undefined when resolver has no loadResource", async () => {
      const resolver: SkillResolver = {
        name: "simple",
        discover: vi.fn(async () => [SKILL_A.metadata]),
        load: vi.fn(async () => SKILL_A),
        // No loadResource
      };
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const result = await registry.loadResource("skill-a", "scripts/test.py");
      expect(result).toBeUndefined();
    });

    it("evicts LRU entries when resource cache is full", async () => {
      const resources = new Map<string, SkillResource>();
      for (let i = 0; i < 5; i++) {
        resources.set(`skill-a:scripts/s${i}.py`, {
          skillName: "skill-a",
          relativePath: `scripts/s${i}.py`,
          category: "script",
          content: `script ${i}`,
          absolutePath: `/skills/skill-a/scripts/s${i}.py`,
        });
      }
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({
        resolvers: [resolver],
        cache: { maxResources: 3 },
      });
      await registry.discover();

      for (let i = 0; i < 5; i++) {
        await registry.loadResource("skill-a", `scripts/s${i}.py`);
      }

      const stats = registry.cacheStats();
      expect(stats.resources.size).toBe(3);
      expect(stats.resources.max).toBe(3);
    });
  });

  describe("cacheStats", () => {
    it("returns initial sizes of 0", () => {
      const registry = new SkillRegistry({ resolvers: [] });
      const stats = registry.cacheStats();
      expect(stats.metadata.size).toBe(0);
      expect(stats.content.size).toBe(0);
      expect(stats.resources.size).toBe(0);
    });

    it("reflects metadata size after discovery", async () => {
      const resolver = createMockResolver("local", [SKILL_A, SKILL_B]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      const stats = registry.cacheStats();
      expect(stats.metadata.size).toBe(2);
      expect(stats.metadata.max).toBe(Number.POSITIVE_INFINITY);
    });

    it("reflects content size after load", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();
      await registry.load("skill-a");

      const stats = registry.cacheStats();
      expect(stats.content.size).toBe(1);
    });

    it("reflects resource size after loadResource", async () => {
      const resources = new Map<string, SkillResource>([
        ["skill-a:scripts/extract.py", RESOURCE_SCRIPT],
      ]);
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();
      await registry.loadResource("skill-a", "scripts/extract.py");

      const stats = registry.cacheStats();
      expect(stats.resources.size).toBe(1);
    });

    it("reports correct max values", () => {
      const registry = new SkillRegistry({
        resolvers: [],
        cache: { maxContent: 50, maxResources: 100 },
      });
      const stats = registry.cacheStats();
      expect(stats.content.max).toBe(50);
      expect(stats.resources.max).toBe(100);
    });
  });

  describe("clear", () => {
    it("clears all three caches", async () => {
      const resources = new Map<string, SkillResource>([
        ["skill-a:scripts/extract.py", RESOURCE_SCRIPT],
      ]);
      const resolver = createMockResolver("local", [SKILL_A], resources);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();
      await registry.load("skill-a");
      await registry.loadResource("skill-a", "scripts/extract.py");

      registry.clear();

      const stats = registry.cacheStats();
      expect(stats.metadata.size).toBe(0);
      expect(stats.content.size).toBe(0);
      expect(stats.resources.size).toBe(0);
      expect(registry.listMetadata()).toEqual([]);
      expect(registry.getMetadata("skill-a")).toBeUndefined();
    });

    it("forces re-load after clear + rediscover", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();
      await registry.load("skill-a");

      registry.clear();
      await registry.discover();
      await registry.load("skill-a");

      // load called twice (before and after clear)
      expect(resolver.load).toHaveBeenCalledTimes(2);
    });
  });

  describe("has", () => {
    it("returns true for discovered skills", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      expect(registry.has("skill-a")).toBe(true);
    });

    it("returns false for unknown skills", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry({ resolvers: [resolver] });
      await registry.discover();

      expect(registry.has("unknown")).toBe(false);
    });
  });
});
