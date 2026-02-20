import { describe, expect, it } from "vitest";
import { generateCodeModePrompt, generateFunctionSignatures } from "../prompt.js";

describe("generateFunctionSignatures", () => {
  it("should generate signatures for known host functions", () => {
    const sigs = generateFunctionSignatures(["read_file", "search"]);
    expect(sigs).toContain("def read_file(path: str) -> str:");
    expect(sigs).toContain("def search(query: str");
  });

  it("should skip unknown host functions", () => {
    const sigs = generateFunctionSignatures(["read_file", "unknown_fn"]);
    expect(sigs).toContain("def read_file");
    expect(sigs).not.toContain("unknown_fn");
  });

  it("should generate all default function signatures", () => {
    const sigs = generateFunctionSignatures(["read_file", "search", "memory_query"]);
    expect(sigs).toContain("def read_file");
    expect(sigs).toContain("def search");
    expect(sigs).toContain("def memory_query");
  });

  it("should return empty string for empty host functions", () => {
    const sigs = generateFunctionSignatures([]);
    expect(sigs).toBe("");
  });

  it("should return empty string for all unknown functions", () => {
    const sigs = generateFunctionSignatures(["foo", "bar"]);
    expect(sigs).toBe("");
  });
});

describe("generateCodeModePrompt", () => {
  it("should include code mode header", () => {
    const prompt = generateCodeModePrompt(["read_file"]);
    expect(prompt).toContain("## Code Mode");
  });

  it("should include function signatures", () => {
    const prompt = generateCodeModePrompt(["read_file", "search"]);
    expect(prompt).toContain("def read_file");
    expect(prompt).toContain("def search");
  });

  it("should include rules section", () => {
    const prompt = generateCodeModePrompt(["read_file"]);
    expect(prompt).toContain("### Rules:");
    expect(prompt).toContain("json.dumps");
    expect(prompt).toContain("Do NOT import");
  });

  it("should include output format with python-code-mode fence", () => {
    const prompt = generateCodeModePrompt(["read_file"]);
    expect(prompt).toContain("python-code-mode");
  });
});
