import { describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "../../registry.js";
import type { Skill, SkillResolver } from "../../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockResolver(name: string, skills: readonly Skill[]): SkillResolver {
  return {
    name,
    discover: vi.fn(async () => skills.map((s) => s.metadata)),
    load: vi.fn(async (skillName: string) => skills.find((s) => s.metadata.name === skillName)),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillRegistry", () => {
  describe("constructor", () => {
    it("creates a registry with resolvers", () => {
      const resolver = createMockResolver("test", []);
      const registry = new SkillRegistry([resolver]);
      expect(registry).toBeDefined();
    });

    it("creates a registry with no resolvers", () => {
      const registry = new SkillRegistry([]);
      expect(registry).toBeDefined();
    });
  });

  describe("discover", () => {
    it("discovers skills from a single resolver", async () => {
      const resolver = createMockResolver("local", [SKILL_A, SKILL_B]);
      const registry = new SkillRegistry([resolver]);

      const count = await registry.discover();
      expect(count).toBe(2);
      expect(resolver.discover).toHaveBeenCalledOnce();
    });

    it("discovers skills from multiple resolvers", async () => {
      const local = createMockResolver("local", [SKILL_A]);
      const remote = createMockResolver("nexus", [SKILL_C]);
      const registry = new SkillRegistry([local, remote]);

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
      const registry = new SkillRegistry([local, remote]);

      const count = await registry.discover();
      expect(count).toBe(1);

      const metadata = registry.getMetadata("skill-a");
      expect(metadata?.description).toBe("Skill A description");
    });

    it("returns 0 for empty resolvers", async () => {
      const registry = new SkillRegistry([]);
      const count = await registry.discover();
      expect(count).toBe(0);
    });

    it("clears previous cache on re-discovery", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);

      await registry.discover();
      expect(registry.listMetadata()).toHaveLength(1);

      // Now resolver returns different skills
      vi.mocked(resolver.discover).mockResolvedValueOnce([SKILL_B.metadata]);
      await registry.discover();
      expect(registry.listMetadata()).toHaveLength(1);
      expect(registry.getMetadata("skill-b")).toBeDefined();
      expect(registry.getMetadata("skill-a")).toBeUndefined();
    });
  });

  describe("getMetadata", () => {
    it("returns metadata for discovered skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      const metadata = registry.getMetadata("skill-a");
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe("skill-a");
      expect(metadata?.description).toBe("Skill A description");
    });

    it("returns undefined for unknown skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      expect(registry.getMetadata("unknown")).toBeUndefined();
    });
  });

  describe("listMetadata", () => {
    it("returns all discovered metadata", async () => {
      const resolver = createMockResolver("local", [SKILL_A, SKILL_B]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      const list = registry.listMetadata();
      expect(list).toHaveLength(2);
      expect(list.map((m) => m.name).sort()).toEqual(["skill-a", "skill-b"]);
    });

    it("returns empty array before discovery", () => {
      const registry = new SkillRegistry([]);
      expect(registry.listMetadata()).toEqual([]);
    });
  });

  describe("load", () => {
    it("loads full skill content from resolver", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      const skill = await registry.load("skill-a");
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe("skill-a");
      expect(skill?.content).toContain("# Skill A");
      expect(resolver.load).toHaveBeenCalledWith("skill-a");
    });

    it("caches loaded skills", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      await registry.load("skill-a");
      await registry.load("skill-a");

      // load should only be called once (cached)
      expect(resolver.load).toHaveBeenCalledTimes(1);
    });

    it("returns undefined for undiscovered skill", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      const skill = await registry.load("unknown");
      expect(skill).toBeUndefined();
    });

    it("loads from correct resolver in chain", async () => {
      const local = createMockResolver("local", [SKILL_A]);
      const remote = createMockResolver("nexus", [SKILL_C]);
      const registry = new SkillRegistry([local, remote]);
      await registry.discover();

      const skill = await registry.load("skill-c");
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe("skill-c");
      expect(remote.load).toHaveBeenCalledWith("skill-c");
      expect(local.load).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("clears both metadata and content caches", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();
      await registry.load("skill-a");

      registry.clear();

      expect(registry.listMetadata()).toEqual([]);
      expect(registry.getMetadata("skill-a")).toBeUndefined();
    });

    it("forces re-load after clear + rediscover", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
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
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      expect(registry.has("skill-a")).toBe(true);
    });

    it("returns false for unknown skills", async () => {
      const resolver = createMockResolver("local", [SKILL_A]);
      const registry = new SkillRegistry([resolver]);
      await registry.discover();

      expect(registry.has("unknown")).toBe(false);
    });
  });
});
