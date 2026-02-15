import { describe, expect, it } from "vitest";
import { formatModelId, normalizeModelSelection, parseModelId } from "../model-id.js";

describe("parseModelId", () => {
  it("parses a valid provider:model string", () => {
    const result = parseModelId("openai:gpt-4o");
    expect(result).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("handles model names with colons", () => {
    const result = parseModelId("huggingface:meta-llama/Llama-3");
    expect(result).toEqual({ provider: "huggingface", model: "meta-llama/Llama-3" });
  });

  it("throws for missing colon", () => {
    expect(() => parseModelId("gpt-4o")).toThrow("Invalid ModelId format");
  });

  it("throws for leading colon", () => {
    expect(() => parseModelId(":gpt-4o")).toThrow("Invalid ModelId format");
  });

  it("throws for trailing colon", () => {
    expect(() => parseModelId("openai:")).toThrow("Invalid ModelId format");
  });

  it("throws for empty string", () => {
    expect(() => parseModelId("")).toThrow("Invalid ModelId format");
  });
});

describe("normalizeModelSelection", () => {
  it("normalizes a string ModelId to ModelRef", () => {
    const result = normalizeModelSelection("openai:gpt-4o");
    expect(result).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("passes through a ModelRef unchanged", () => {
    const ref = { provider: "openai", model: "gpt-4o", temperature: 0.7 };
    const result = normalizeModelSelection(ref);
    expect(result).toBe(ref);
  });
});

describe("formatModelId", () => {
  it("formats a ModelRef to provider:model string", () => {
    const result = formatModelId({ provider: "openai", model: "gpt-4o" });
    expect(result).toBe("openai:gpt-4o");
  });

  it("ignores extra fields on ModelRef", () => {
    const result = formatModelId({
      provider: "anthropic",
      model: "claude-3",
      temperature: 0.5,
    });
    expect(result).toBe("anthropic:claude-3");
  });
});
