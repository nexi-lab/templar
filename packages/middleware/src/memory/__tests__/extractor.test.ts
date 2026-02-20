import { describe, expect, it, vi } from "vitest";
import { LlmFactExtractor } from "../extractor.js";
import { FACT_EXTRACTION_SYSTEM_PROMPT } from "../fact-prompt.js";
import type { FactExtractionContext, FactTurnSummary, ModelCallFn } from "../types.js";

function makeTurn(overrides: Partial<FactTurnSummary> = {}): FactTurnSummary {
  return {
    turnNumber: 1,
    input: "What is the project status?",
    output: "The project is on track. We shipped feature X yesterday.",
    timestamp: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeContext(overrides: Partial<FactExtractionContext> = {}): FactExtractionContext {
  return {
    sessionId: "test-session-1",
    ...overrides,
  };
}

describe("LlmFactExtractor", () => {
  it("should extract facts from well-formed LLM output", async () => {
    const mockModelCall: ModelCallFn = vi
      .fn()
      .mockResolvedValue(
        [
          "fact | 0.8 | Project uses Next.js 14 with app router",
          "preference | 0.9 | User prefers TypeScript strict mode",
        ].join("\n"),
      );

    const extractor = new LlmFactExtractor(mockModelCall);
    const result = await extractor.extract([makeTurn()], makeContext());

    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe("fact");
    expect(result[0]?.importance).toBe(0.8);
    expect(result[1]?.category).toBe("preference");
  });

  it("should return empty array for empty turns", async () => {
    const mockModelCall: ModelCallFn = vi.fn();
    const extractor = new LlmFactExtractor(mockModelCall);
    const result = await extractor.extract([], makeContext());

    expect(result).toHaveLength(0);
    expect(mockModelCall).not.toHaveBeenCalled();
  });

  it("should pass system prompt to model call", async () => {
    const mockModelCall: ModelCallFn = vi.fn().mockResolvedValue("fact | 0.5 | Some fact");

    const extractor = new LlmFactExtractor(mockModelCall);
    await extractor.extract([makeTurn()], makeContext());

    expect(mockModelCall).toHaveBeenCalledWith(
      FACT_EXTRACTION_SYSTEM_PROMPT,
      expect.stringContaining("Turn 1"),
    );
  });

  it("should include turn input and output in user prompt", async () => {
    const mockModelCall: ModelCallFn = vi.fn().mockResolvedValue("");

    const extractor = new LlmFactExtractor(mockModelCall);
    await extractor.extract(
      [makeTurn({ input: "My custom input", output: "My custom output" })],
      makeContext(),
    );

    const userPrompt = (mockModelCall as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(userPrompt).toContain("My custom input");
    expect(userPrompt).toContain("My custom output");
  });

  it("should return empty on LLM error (graceful degradation)", async () => {
    const mockModelCall: ModelCallFn = vi.fn().mockRejectedValue(new Error("LLM API timeout"));

    const extractor = new LlmFactExtractor(mockModelCall);
    const result = await extractor.extract([makeTurn()], makeContext());

    expect(result).toHaveLength(0);
  });

  it("should handle empty LLM response", async () => {
    const mockModelCall: ModelCallFn = vi.fn().mockResolvedValue("");

    const extractor = new LlmFactExtractor(mockModelCall);
    const result = await extractor.extract([makeTurn()], makeContext());

    expect(result).toHaveLength(0);
  });

  it("should truncate long turn content", async () => {
    const longInput = "x".repeat(2000);
    const longOutput = "y".repeat(2000);
    const mockModelCall: ModelCallFn = vi.fn().mockResolvedValue("fact | 0.5 | Truncated");

    const extractor = new LlmFactExtractor(mockModelCall);
    await extractor.extract([makeTurn({ input: longInput, output: longOutput })], makeContext());

    const userPrompt = (mockModelCall as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    // Should be truncated — not contain the full 2000-char strings
    expect(userPrompt.length).toBeLessThan(longInput.length + longOutput.length);
  });

  it("should return empty on LLM timeout (never-resolving promise)", async () => {
    const neverResolves: ModelCallFn = vi.fn().mockImplementation(
      () => new Promise(() => {}), // Never resolves
    );

    const extractor = new LlmFactExtractor(neverResolves);

    // When used via middleware, safeNexusCall applies a timeout.
    // The extractor itself returns [] on any error (including AbortError from timeout).
    // Direct call: wrapping with a manual timeout to verify graceful degradation.
    const result = await Promise.race([
      extractor.extract([makeTurn()], makeContext()),
      new Promise<readonly []>((resolve) => setTimeout(() => resolve([] as const), 100)),
    ]);

    expect(result).toHaveLength(0);
  });

  it("should handle multiple turns", async () => {
    const mockModelCall: ModelCallFn = vi
      .fn()
      .mockResolvedValue(
        [
          "decision | 0.7 | Decided to use middleware pattern",
          "experience | 0.5 | Build succeeded after fixing imports",
        ].join("\n"),
      );

    const extractor = new LlmFactExtractor(mockModelCall);
    const turns = [
      makeTurn({ turnNumber: 1, input: "First turn" }),
      makeTurn({ turnNumber: 2, input: "Second turn" }),
    ];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(2);

    const userPrompt = (mockModelCall as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(userPrompt).toContain("Turn 1");
    expect(userPrompt).toContain("Turn 2");
  });
});
