import { describe, expect, it } from "vitest";
import {
  SkillCompatibilitySchema,
  SkillDescriptionSchema,
  SkillFrontmatterSchema,
  SkillNameSchema,
  validateFrontmatter,
} from "../../schema.js";

describe("SkillNameSchema", () => {
  it("accepts valid lowercase names", () => {
    expect(SkillNameSchema.parse("pdf-processing")).toBe("pdf-processing");
    expect(SkillNameSchema.parse("code-review")).toBe("code-review");
    expect(SkillNameSchema.parse("a")).toBe("a");
    expect(SkillNameSchema.parse("data-analysis")).toBe("data-analysis");
  });

  it("accepts single character names", () => {
    expect(SkillNameSchema.parse("a")).toBe("a");
    expect(SkillNameSchema.parse("z")).toBe("z");
    expect(SkillNameSchema.parse("0")).toBe("0");
    expect(SkillNameSchema.parse("9")).toBe("9");
  });

  it("accepts names with numbers", () => {
    expect(SkillNameSchema.parse("v2")).toBe("v2");
    expect(SkillNameSchema.parse("tool3")).toBe("tool3");
    expect(SkillNameSchema.parse("123")).toBe("123");
  });

  it("rejects uppercase letters", () => {
    expect(() => SkillNameSchema.parse("PDF-Processing")).toThrow();
    expect(() => SkillNameSchema.parse("Code")).toThrow();
    expect(() => SkillNameSchema.parse("A")).toThrow();
  });

  it("rejects names starting with a hyphen", () => {
    expect(() => SkillNameSchema.parse("-pdf")).toThrow();
  });

  it("rejects names ending with a hyphen", () => {
    expect(() => SkillNameSchema.parse("pdf-")).toThrow();
  });

  it("rejects consecutive hyphens", () => {
    expect(() => SkillNameSchema.parse("pdf--processing")).toThrow();
    expect(() => SkillNameSchema.parse("a---b")).toThrow();
  });

  it("rejects names longer than 64 characters", () => {
    const longName = "a".repeat(65);
    expect(() => SkillNameSchema.parse(longName)).toThrow();
  });

  it("accepts names exactly 64 characters", () => {
    const maxName = "a".repeat(64);
    expect(SkillNameSchema.parse(maxName)).toBe(maxName);
  });

  it("rejects empty string", () => {
    expect(() => SkillNameSchema.parse("")).toThrow();
  });

  it("rejects special characters", () => {
    expect(() => SkillNameSchema.parse("pdf_processing")).toThrow();
    expect(() => SkillNameSchema.parse("pdf.processing")).toThrow();
    expect(() => SkillNameSchema.parse("pdf processing")).toThrow();
    expect(() => SkillNameSchema.parse("pdf@processing")).toThrow();
  });
});

describe("SkillDescriptionSchema", () => {
  it("accepts valid descriptions", () => {
    expect(SkillDescriptionSchema.parse("A valid description.")).toBe("A valid description.");
  });

  it("rejects empty string", () => {
    expect(() => SkillDescriptionSchema.parse("")).toThrow();
  });

  it("rejects descriptions over 1024 characters", () => {
    const longDesc = "a".repeat(1025);
    expect(() => SkillDescriptionSchema.parse(longDesc)).toThrow();
  });

  it("accepts descriptions exactly 1024 characters", () => {
    const maxDesc = "a".repeat(1024);
    expect(SkillDescriptionSchema.parse(maxDesc)).toBe(maxDesc);
  });
});

describe("SkillCompatibilitySchema", () => {
  it("accepts valid compatibility strings", () => {
    expect(SkillCompatibilitySchema.parse("Requires git and docker")).toBe(
      "Requires git and docker",
    );
  });

  it("rejects empty string", () => {
    expect(() => SkillCompatibilitySchema.parse("")).toThrow();
  });

  it("rejects strings over 500 characters", () => {
    const longCompat = "a".repeat(501);
    expect(() => SkillCompatibilitySchema.parse(longCompat)).toThrow();
  });
});

describe("SkillFrontmatterSchema", () => {
  it("accepts minimal valid frontmatter", () => {
    const result = SkillFrontmatterSchema.parse({
      name: "test-skill",
      description: "A test skill.",
    });
    expect(result.name).toBe("test-skill");
    expect(result.description).toBe("A test skill.");
  });

  it("accepts frontmatter with all optional fields", () => {
    const result = SkillFrontmatterSchema.parse({
      name: "full-skill",
      description: "A full skill.",
      license: "Apache-2.0",
      compatibility: "Requires git",
      metadata: { author: "test", version: "1.0" },
      "allowed-tools": "Bash(git:*) Read",
    });
    expect(result.name).toBe("full-skill");
    expect(result.license).toBe("Apache-2.0");
    expect(result.compatibility).toBe("Requires git");
    expect(result.metadata).toEqual({ author: "test", version: "1.0" });
    expect(result["allowed-tools"]).toBe("Bash(git:*) Read");
  });

  it("rejects missing name", () => {
    expect(() => SkillFrontmatterSchema.parse({ description: "A test skill." })).toThrow();
  });

  it("rejects missing description", () => {
    expect(() => SkillFrontmatterSchema.parse({ name: "test-skill" })).toThrow();
  });

  it("rejects invalid name in full frontmatter", () => {
    expect(() =>
      SkillFrontmatterSchema.parse({
        name: "Invalid-Name",
        description: "A test skill.",
      }),
    ).toThrow();
  });
});

describe("validateFrontmatter", () => {
  it("transforms allowed-tools to allowedTools", () => {
    const result = validateFrontmatter({
      name: "test-skill",
      description: "A test skill.",
      "allowed-tools": "Bash(git:*) Read",
    });
    expect(result.allowedTools).toBe("Bash(git:*) Read");
    expect(result).not.toHaveProperty("allowed-tools");
  });

  it("returns clean SkillMetadata without undefined optional fields", () => {
    const result = validateFrontmatter({
      name: "test-skill",
      description: "A test skill.",
    });
    expect(result).toEqual({
      name: "test-skill",
      description: "A test skill.",
    });
    expect(Object.keys(result)).toEqual(["name", "description"]);
  });

  it("includes all populated optional fields", () => {
    const result = validateFrontmatter({
      name: "full-skill",
      description: "Full skill.",
      license: "MIT",
      compatibility: "Any",
      metadata: { author: "test" },
      "allowed-tools": "Read",
    });
    expect(result).toEqual({
      name: "full-skill",
      description: "Full skill.",
      license: "MIT",
      compatibility: "Any",
      metadata: { author: "test" },
      allowedTools: "Read",
    });
  });

  it("throws on invalid data", () => {
    expect(() => validateFrontmatter({})).toThrow();
    expect(() => validateFrontmatter(null)).toThrow();
    expect(() => validateFrontmatter("not an object")).toThrow();
  });
});
