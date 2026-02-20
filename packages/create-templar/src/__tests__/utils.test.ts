import { afterEach, describe, expect, it } from "vitest";
import {
  detectPackageManager,
  formatTargetDir,
  isTextFile,
  replaceTemplateVars,
  validateProjectName,
} from "../utils.js";

describe("validateProjectName", () => {
  it("accepts a valid name", () => {
    expect(validateProjectName("my-agent")).toEqual({ valid: true });
  });

  it("accepts names with dots, underscores, tildes", () => {
    expect(validateProjectName("my.agent")).toEqual({ valid: true });
    expect(validateProjectName("my_agent")).toEqual({ valid: true });
    expect(validateProjectName("my~agent")).toEqual({ valid: true });
  });

  it("rejects empty string", () => {
    const result = validateProjectName("");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("rejects whitespace-only string", () => {
    const result = validateProjectName("   ");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("rejects dots-only names", () => {
    const result = validateProjectName("...");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("dots");
  });

  it("rejects names starting with dot", () => {
    const result = validateProjectName(".hidden");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("dot or hyphen");
  });

  it("rejects names starting with hyphen", () => {
    const result = validateProjectName("-bad");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("dot or hyphen");
  });

  it("rejects uppercase names", () => {
    const result = validateProjectName("MyAgent");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("lowercase");
  });

  it("rejects names with spaces", () => {
    const result = validateProjectName("my agent");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("lowercase letters");
  });

  it("rejects reserved names", () => {
    const result = validateProjectName("node_modules");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("reserved");
  });

  it("rejects names longer than 214 characters", () => {
    const result = validateProjectName("a".repeat(215));
    expect(result.valid).toBe(false);
    expect(result.message).toContain("214");
  });

  it("accepts a 214-character name", () => {
    expect(validateProjectName("a".repeat(214))).toEqual({ valid: true });
  });
});

describe("detectPackageManager", () => {
  const originalEnv = process.env.npm_config_user_agent;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = originalEnv;
    }
  });

  it("detects pnpm", () => {
    process.env.npm_config_user_agent = "pnpm/10.0.0 node/v22.0.0";
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("detects yarn", () => {
    process.env.npm_config_user_agent = "yarn/4.0.0 node/v22.0.0";
    expect(detectPackageManager()).toBe("yarn");
  });

  it("detects bun", () => {
    process.env.npm_config_user_agent = "bun/1.0.0 node/v22.0.0";
    expect(detectPackageManager()).toBe("bun");
  });

  it("detects npm", () => {
    process.env.npm_config_user_agent = "npm/10.0.0 node/v22.0.0";
    expect(detectPackageManager()).toBe("npm");
  });

  it("defaults to npm when agent is undefined", () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe("npm");
  });
});

describe("replaceTemplateVars", () => {
  it("replaces a single variable", () => {
    expect(replaceTemplateVars("Hello {{name}}", { name: "world" })).toBe("Hello world");
  });

  it("replaces multiple variables", () => {
    const result = replaceTemplateVars("{{name}}: {{description}}", {
      name: "my-agent",
      description: "A test agent",
    });
    expect(result).toBe("my-agent: A test agent");
  });

  it("replaces multiple occurrences of the same variable", () => {
    expect(replaceTemplateVars("{{name}} is {{name}}", { name: "foo" })).toBe("foo is foo");
  });

  it("returns content unchanged when no variables match", () => {
    expect(replaceTemplateVars("no vars here", { name: "test" })).toBe("no vars here");
  });

  it("returns empty string unchanged", () => {
    expect(replaceTemplateVars("", { name: "test" })).toBe("");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(replaceTemplateVars("{{unknown}}", { name: "test" })).toBe("{{unknown}}");
  });
});

describe("isTextFile", () => {
  it("identifies .yaml as text", () => {
    expect(isTextFile("templar.yaml")).toBe(true);
  });

  it("identifies .yml as text", () => {
    expect(isTextFile("config.yml")).toBe(true);
  });

  it("identifies .md as text", () => {
    expect(isTextFile("README.md")).toBe(true);
  });

  it("identifies .json as text", () => {
    expect(isTextFile("package.json")).toBe(true);
  });

  it("identifies .ts as text", () => {
    expect(isTextFile("index.ts")).toBe(true);
  });

  it("identifies .js as text", () => {
    expect(isTextFile("index.js")).toBe(true);
  });

  it("identifies .env as text", () => {
    expect(isTextFile(".env")).toBe(true);
  });

  it("identifies .example as text", () => {
    expect(isTextFile(".env.example")).toBe(true);
  });

  it("identifies _-prefixed files as text", () => {
    expect(isTextFile("_gitignore")).toBe(true);
  });

  it("rejects binary files", () => {
    expect(isTextFile("image.png")).toBe(false);
    expect(isTextFile("photo.jpg")).toBe(false);
    expect(isTextFile("icon.ico")).toBe(false);
  });
});

describe("formatTargetDir", () => {
  it("trims whitespace", () => {
    expect(formatTargetDir("  my-agent  ")).toBe("my-agent");
  });

  it("removes trailing slashes", () => {
    expect(formatTargetDir("my-agent/")).toBe("my-agent");
    expect(formatTargetDir("my-agent///")).toBe("my-agent");
  });

  it("handles clean input unchanged", () => {
    expect(formatTargetDir("my-agent")).toBe("my-agent");
  });
});
