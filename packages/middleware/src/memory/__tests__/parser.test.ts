import { describe, expect, it } from "vitest";
import { parseFacts } from "../parser.js";

describe("parseFacts", () => {
  it("should parse well-formed lines", () => {
    const input = "fact | 0.8 | User prefers TypeScript over JavaScript";
    const result = parseFacts(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "User prefers TypeScript over JavaScript",
      category: "fact",
      importance: 0.8,
    });
  });

  it("should parse multiple lines", () => {
    const input = [
      "preference | 0.9 | User wants dark mode by default",
      "decision | 0.7 | Chose React over Vue for the frontend",
      "experience | 0.5 | Session involved debugging a CSS issue",
    ].join("\n");

    const result = parseFacts(input);
    expect(result).toHaveLength(3);
    expect(result[0]?.category).toBe("preference");
    expect(result[1]?.category).toBe("decision");
    expect(result[2]?.category).toBe("experience");
  });

  it("should return empty array for empty input", () => {
    expect(parseFacts("")).toEqual([]);
    expect(parseFacts("   ")).toEqual([]);
    expect(parseFacts("\n\n")).toEqual([]);
  });

  it("should skip lines without pipes", () => {
    const input = "This is just a plain sentence without pipes";
    expect(parseFacts(input)).toEqual([]);
  });

  it("should skip lines with only one pipe (missing importance)", () => {
    const input = "fact | some content without importance";
    // This has a pipe but only two parts instead of three
    expect(parseFacts(input)).toEqual([]);
  });

  it("should handle embedded pipes in content", () => {
    const input = "fact | 0.6 | User said: use foo | bar as separator";
    const result = parseFacts(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("User said: use foo | bar as separator");
  });

  it("should skip lines with invalid category", () => {
    const input = "unknown_cat | 0.5 | Some content here";
    expect(parseFacts(input)).toEqual([]);
  });

  it("should skip lines with non-numeric importance", () => {
    const input = "fact | high | Some content here";
    expect(parseFacts(input)).toEqual([]);
  });

  it("should handle case-insensitive categories", () => {
    const input = [
      "FACT | 0.8 | Upper case category",
      "Preference | 0.7 | Mixed case category",
    ].join("\n");

    const result = parseFacts(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe("fact");
    expect(result[1]?.category).toBe("preference");
  });

  it("should skip lines with empty content", () => {
    const input = "fact | 0.5 |   ";
    expect(parseFacts(input)).toEqual([]);
  });

  it("should clamp importance to [0, 1] range", () => {
    const input = ["fact | 1.5 | Over max importance", "fact | -0.3 | Under min importance"].join(
      "\n",
    );

    const result = parseFacts(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.importance).toBe(1.0);
    expect(result[1]?.importance).toBe(0.0);
  });

  it("should trim whitespace from all parts", () => {
    const input = "  fact  |  0.75  |  Trimmed content here  ";
    const result = parseFacts(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("fact");
    expect(result[0]?.importance).toBe(0.75);
    expect(result[0]?.content).toBe("Trimmed content here");
  });
});
