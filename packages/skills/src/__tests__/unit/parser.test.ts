import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSkillContent, parseSkillFile } from "../../parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(__dirname, "../fixtures");

// ---------------------------------------------------------------------------
// parseSkillContent — inline content parsing
// ---------------------------------------------------------------------------

describe("parseSkillContent", () => {
  it("parses minimal valid SKILL.md content", () => {
    const content = `---
name: test-skill
description: A test skill.
---

# Test Skill

Instructions here.`;

    const result = parseSkillContent(content);
    expect(result.metadata.name).toBe("test-skill");
    expect(result.metadata.description).toBe("A test skill.");
    expect(result.content).toContain("# Test Skill");
    expect(result.content).toContain("Instructions here.");
  });

  it("parses frontmatter with all optional fields", () => {
    const content = `---
name: full-skill
description: A comprehensive skill.
license: MIT
compatibility: Requires git
metadata:
  author: test-team
  version: "2.0"
allowed-tools: Bash(git:*) Read Write
---

# Full Skill`;

    const result = parseSkillContent(content);
    expect(result.metadata.name).toBe("full-skill");
    expect(result.metadata.license).toBe("MIT");
    expect(result.metadata.compatibility).toBe("Requires git");
    expect(result.metadata.metadata).toEqual({ author: "test-team", version: "2.0" });
    expect(result.metadata.allowedTools).toBe("Bash(git:*) Read Write");
  });

  it("returns trimmed body content without frontmatter", () => {
    const content = `---
name: test-skill
description: Test.
---

Body content here.

More content.`;

    const result = parseSkillContent(content);
    expect(result.content).toBe("Body content here.\n\nMore content.");
    expect(result.content).not.toContain("---");
    expect(result.content).not.toContain("name:");
  });

  it("handles empty body content", () => {
    const content = `---
name: test-skill
description: Test.
---`;

    const result = parseSkillContent(content);
    expect(result.content).toBe("");
  });

  it("handles --- inside body content without breaking frontmatter", () => {
    const content = `---
name: test-skill
description: Test.
---

Some text before.

---

A horizontal rule above.`;

    const result = parseSkillContent(content);
    expect(result.metadata.name).toBe("test-skill");
    expect(result.content).toContain("---");
    expect(result.content).toContain("A horizontal rule above.");
  });

  it("throws SKILL_PARSE_ERROR for content without frontmatter", () => {
    expect(() => parseSkillContent("# Just markdown, no frontmatter")).toThrow(/frontmatter/i);
  });

  it("throws SKILL_PARSE_ERROR for empty content", () => {
    expect(() => parseSkillContent("")).toThrow(/frontmatter/i);
  });

  it("throws SKILL_PARSE_ERROR for only delimiter markers", () => {
    expect(() => parseSkillContent("---\n---")).toThrow();
  });

  it("throws SKILL_VALIDATION_ERROR for missing required name", () => {
    const content = `---
description: A skill without a name.
---

Body.`;
    expect(() => parseSkillContent(content)).toThrow();
  });

  it("throws SKILL_VALIDATION_ERROR for missing required description", () => {
    const content = `---
name: no-description
---

Body.`;
    expect(() => parseSkillContent(content)).toThrow();
  });

  it("throws SKILL_VALIDATION_ERROR for uppercase name", () => {
    const content = `---
name: Invalid-Name
description: Bad name.
---

Body.`;
    expect(() => parseSkillContent(content)).toThrow();
  });

  it("throws SKILL_VALIDATION_ERROR for consecutive hyphens in name", () => {
    const content = `---
name: bad--name
description: Bad name.
---

Body.`;
    expect(() => parseSkillContent(content)).toThrow();
  });

  it("throws SKILL_VALIDATION_ERROR for description over 1024 chars", () => {
    const longDesc = "a".repeat(1025);
    const content = `---
name: test-skill
description: "${longDesc}"
---

Body.`;
    expect(() => parseSkillContent(content)).toThrow();
  });

  it("preserves Windows-style line endings in body", () => {
    const content = "---\r\nname: test-skill\r\ndescription: Test.\r\n---\r\n\r\nBody content.\r\n";
    const result = parseSkillContent(content);
    expect(result.metadata.name).toBe("test-skill");
  });

  it("accepts filePath parameter and includes it in result", () => {
    const content = `---
name: test-skill
description: Test.
---

Body.`;
    const result = parseSkillContent(content, "/path/to/SKILL.md");
    expect(result.filePath).toBe("/path/to/SKILL.md");
  });

  it("defaults filePath to empty string when not provided", () => {
    const content = `---
name: test-skill
description: Test.
---

Body.`;
    const result = parseSkillContent(content);
    expect(result.filePath).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseSkillFile — file-based parsing
// ---------------------------------------------------------------------------

describe("parseSkillFile", () => {
  it("parses valid-skill fixture", async () => {
    const result = await parseSkillFile(resolve(FIXTURES, "valid-skill/SKILL.md"));
    expect(result.metadata.name).toBe("valid-skill");
    expect(result.metadata.description).toContain("minimal valid skill");
    expect(result.content).toContain("# Valid Skill");
    expect(result.filePath).toContain("valid-skill/SKILL.md");
  });

  it("parses full-skill fixture with all fields", async () => {
    const result = await parseSkillFile(resolve(FIXTURES, "full-skill/SKILL.md"));
    expect(result.metadata.name).toBe("full-skill");
    expect(result.metadata.license).toBe("Apache-2.0");
    expect(result.metadata.compatibility).toBe("Requires git and access to the internet");
    expect(result.metadata.metadata).toEqual({
      author: "templar-team",
      version: "1.0",
      category: "testing",
    });
    expect(result.metadata.allowedTools).toBe("Bash(git:*) Read Write");
  });

  it("parses with-scripts fixture", async () => {
    const result = await parseSkillFile(resolve(FIXTURES, "with-scripts/SKILL.md"));
    expect(result.metadata.name).toBe("with-scripts");
    expect(result.content).toContain("scripts/extract.py");
  });

  it("parses with-references fixture", async () => {
    const result = await parseSkillFile(resolve(FIXTURES, "with-references/SKILL.md"));
    expect(result.metadata.name).toBe("with-references");
    expect(result.content).toContain("references/REFERENCE.md");
  });

  it("throws for invalid-name fixture", async () => {
    await expect(parseSkillFile(resolve(FIXTURES, "invalid-name/SKILL.md"))).rejects.toThrow();
  });

  it("throws for non-existent file", async () => {
    await expect(parseSkillFile(resolve(FIXTURES, "does-not-exist/SKILL.md"))).rejects.toThrow();
  });
});
