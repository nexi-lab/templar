import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../types.js";
import { extractCodeBlock, validateCodeModeConfig, validateCodeOutput } from "../validation.js";

describe("validateCodeModeConfig", () => {
  it("should accept a valid default config", () => {
    const errors = validateCodeModeConfig(DEFAULT_CONFIG);
    expect(errors).toEqual([]);
  });

  it("should reject invalid resourceProfile", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      resourceProfile: "invalid" as "strict",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("resourceProfile");
  });

  it("should reject non-positive maxCodeLength", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      maxCodeLength: 0,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("maxCodeLength");
  });

  it("should reject negative maxCodeLength", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      maxCodeLength: -100,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should reject excessively large maxCodeLength", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      maxCodeLength: 200_000,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("100,000");
  });

  it("should reject empty string in hostFunctions", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      hostFunctions: ["read_file", ""],
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("non-empty");
  });

  it("should accept custom valid config", () => {
    const errors = validateCodeModeConfig({
      enabled: false,
      resourceProfile: "strict",
      maxCodeLength: 5000,
      hostFunctions: ["read_file"],
    });
    expect(errors).toEqual([]);
  });

  it("should accept permissive profile", () => {
    const errors = validateCodeModeConfig({
      ...DEFAULT_CONFIG,
      resourceProfile: "permissive",
    });
    expect(errors).toEqual([]);
  });
});

describe("validateCodeOutput", () => {
  it("should parse valid JSON stdout", () => {
    const result = validateCodeOutput('{"result": 42}', "");
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: 42 });
  });

  it("should handle empty stdout", () => {
    const result = validateCodeOutput("", "");
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it("should handle whitespace-only stdout", () => {
    const result = validateCodeOutput("   \n  ", "");
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it("should handle non-JSON stdout", () => {
    const result = validateCodeOutput("hello world", "");
    expect(result.success).toBe(false);
    expect(result.data).toBe("hello world");
  });

  it("should preserve stderr", () => {
    const result = validateCodeOutput('{"ok": true}', "warning: something");
    expect(result.success).toBe(true);
    expect(result.stderr).toBe("warning: something");
  });

  it("should preserve rawStdout", () => {
    const result = validateCodeOutput('  {"ok": true}  ', "");
    expect(result.rawStdout).toBe('  {"ok": true}  ');
  });

  it("should parse JSON arrays", () => {
    const result = validateCodeOutput("[1, 2, 3]", "");
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it("should parse JSON strings", () => {
    const result = validateCodeOutput('"hello"', "");
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello");
  });
});

describe("extractCodeBlock", () => {
  it("should extract code from python-code-mode block", () => {
    const content = `Here's the code:

\`\`\`python-code-mode
result = read_file("src/main.ts")
print(json.dumps({"content": result}))
\`\`\`

That will read the file.`;

    const code = extractCodeBlock(content);
    expect(code).toBe('result = read_file("src/main.ts")\nprint(json.dumps({"content": result}))');
  });

  it("should return null when no code-mode block exists", () => {
    const content = "Just a normal response with no code.";
    expect(extractCodeBlock(content)).toBeNull();
  });

  it("should not match regular python blocks", () => {
    const content = "```python\nprint('hello')\n```";
    expect(extractCodeBlock(content)).toBeNull();
  });

  it("should trim whitespace from extracted code", () => {
    const content = "```python-code-mode\n  x = 1  \n```";
    const code = extractCodeBlock(content);
    expect(code).toBe("x = 1");
  });

  it("should handle multi-line code blocks", () => {
    const content = `\`\`\`python-code-mode
a = read_file("a.ts")
b = read_file("b.ts")
c = search("*.test.ts")
print(json.dumps({"a": a, "b": b, "tests": c}))
\`\`\``;

    const code = extractCodeBlock(content);
    expect(code).toContain("a = read_file");
    expect(code).toContain("b = read_file");
    expect(code).toContain("c = search");
  });
});
