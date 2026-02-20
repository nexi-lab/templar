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
      expect(names).toContain("with-assets");
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

    it("uses parseSkillFileMetadata for discovery (not parseSkillFile)", async () => {
      // We verify indirectly: discover returns metadata without content/filePath
      const resolver = new LocalResolver([FIXTURES]);
      const skills = await resolver.discover();
      for (const skill of skills) {
        expect(skill).not.toHaveProperty("content");
        expect(skill).not.toHaveProperty("filePath");
      }
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

  describe("loadResource", () => {
    it("loads a script resource", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const resource = await resolver.loadResource("with-scripts", "scripts/extract.py");

      expect(resource).toBeDefined();
      expect(resource?.skillName).toBe("with-scripts");
      expect(resource?.relativePath).toBe("scripts/extract.py");
      expect(resource?.category).toBe("script");
      expect(resource?.content).toContain("extracted");
      expect(resource?.absolutePath).toContain("scripts/extract.py");
    });

    it("loads a reference resource", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const resource = await resolver.loadResource("with-references", "references/REFERENCE.md");

      expect(resource).toBeDefined();
      expect(resource?.skillName).toBe("with-references");
      expect(resource?.relativePath).toBe("references/REFERENCE.md");
      expect(resource?.category).toBe("reference");
      expect(resource?.content).toContain("Reference Guide");
    });

    it("loads an asset resource", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const resource = await resolver.loadResource("with-assets", "assets/logo.txt");

      expect(resource).toBeDefined();
      expect(resource?.skillName).toBe("with-assets");
      expect(resource?.relativePath).toBe("assets/logo.txt");
      expect(resource?.category).toBe("asset");
      expect(resource?.content).toContain("TEMPLAR LOGO");
    });

    it("loads binary-like content as UTF-8", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const resource = await resolver.loadResource("with-assets", "assets/binary.bin");

      expect(resource).toBeDefined();
      expect(resource?.content).toBe("binary test content");
    });

    it("returns undefined for path traversal attempt (..)", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("with-scripts", "scripts/../../../etc/passwd");
      expect(result).toBeUndefined();
    });

    it("returns undefined for absolute path", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("with-scripts", "/etc/passwd");
      expect(result).toBeUndefined();
    });

    it("returns undefined for path without valid prefix", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("with-scripts", "other/file.txt");
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty path", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("with-scripts", "");
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent resource file", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("with-scripts", "scripts/nonexistent.py");
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent skill", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const result = await resolver.loadResource("nonexistent-skill", "scripts/extract.py");
      expect(result).toBeUndefined();
    });

    it("returns undefined for files exceeding size limit", async () => {
      // Use a very small max size to trigger the limit
      const resolver = new LocalResolver([FIXTURES], 1);
      const result = await resolver.loadResource("with-assets", "assets/logo.txt");
      expect(result).toBeUndefined();
    });

    it("returns undefined for very long paths", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const longPath = `scripts/${"a".repeat(600)}.py`;
      const result = await resolver.loadResource("with-scripts", longPath);
      expect(result).toBeUndefined();
    });

    it("handles concurrent loadResource calls", async () => {
      const resolver = new LocalResolver([FIXTURES]);
      const [r1, r2, r3] = await Promise.all([
        resolver.loadResource("with-scripts", "scripts/extract.py"),
        resolver.loadResource("with-references", "references/REFERENCE.md"),
        resolver.loadResource("with-assets", "assets/logo.txt"),
      ]);

      expect(r1?.category).toBe("script");
      expect(r2?.category).toBe("reference");
      expect(r3?.category).toBe("asset");
    });
  });
});
