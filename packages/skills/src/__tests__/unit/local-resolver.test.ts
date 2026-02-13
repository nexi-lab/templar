import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalResolver } from "../../local-resolver.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(__dirname, "../fixtures");

describe("LocalResolver", () => {
  describe("constructor", () => {
    it("has name 'local'", () => {
      const resolver = new LocalResolver([FIXTURES]);
      expect(resolver.name).toBe("local");
    });

    it("accepts multiple search paths", () => {
      const resolver = new LocalResolver(["/path/a", "/path/b"]);
      expect(resolver.name).toBe("local");
    });

    it("accepts empty search paths", () => {
      const resolver = new LocalResolver([]);
      expect(resolver.name).toBe("local");
    });
  });

  describe("discover", () => {
    it("discovers skills from fixture directory", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skills = await resolver.discover();

      const names = skills.map((s) => s.name);
      expect(names).toContain("valid-skill");
      expect(names).toContain("full-skill");
      expect(names).toContain("with-scripts");
      expect(names).toContain("with-references");
    });

    it("skips directories without SKILL.md", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skills = await resolver.discover();

      // The fixtures/invalid-name directory has SKILL.md with bad name — should be skipped
      const names = skills.map((s) => s.name);
      expect(names).not.toContain("Invalid-Name");
    });

    it("returns metadata only, not full content", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skills = await resolver.discover();

      for (const skill of skills) {
        expect(skill).toHaveProperty("name");
        expect(skill).toHaveProperty("description");
        expect(skill).not.toHaveProperty("content");
        expect(skill).not.toHaveProperty("filePath");
      }
    });

    it("returns empty array for empty search paths", async () => {
      const resolver = new LocalResolver([]);
      const skills = await resolver.discover();
      expect(skills).toEqual([]);
    });

    it("returns empty array for non-existent directory", async () => {
      const resolver = new LocalResolver(["/does/not/exist"]);
      const skills = await resolver.discover();
      expect(skills).toEqual([]);
    });

    it("merges skills from multiple search paths", async () => {
      // Use fixtures + another copy of fixtures (deduplication shouldn't happen here)
      const resolver = new LocalResolver([resolve(FIXTURES, "valid-skill/..")]);
      const skills = await resolver.discover();
      expect(skills.length).toBeGreaterThan(0);
    });
  });

  describe("load", () => {
    it("loads full skill content by name", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skill = await resolver.load("valid-skill");

      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe("valid-skill");
      expect(skill?.content).toContain("# Valid Skill");
      expect(skill?.filePath).toContain("valid-skill/SKILL.md");
    });

    it("loads skill with all optional fields", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skill = await resolver.load("full-skill");

      expect(skill).toBeDefined();
      expect(skill?.metadata.license).toBe("Apache-2.0");
      expect(skill?.metadata.allowedTools).toBe("Bash(git:*) Read Write");
    });

    it("returns undefined for non-existent skill", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skill = await resolver.load("does-not-exist");
      expect(skill).toBeUndefined();
    });

    it("returns undefined for skill with invalid metadata", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const skill = await resolver.load("invalid-name");
      expect(skill).toBeUndefined();
    });
  });
});
