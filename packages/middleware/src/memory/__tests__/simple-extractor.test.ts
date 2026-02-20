import { describe, expect, it } from "vitest";
import { SimpleFactExtractor } from "../simple-extractor.js";
import type { FactExtractionContext, FactTurnSummary } from "../types.js";

function makeTurn(overrides: Partial<FactTurnSummary> = {}): FactTurnSummary {
  return {
    turnNumber: 1,
    input: "What is the project status?",
    output: "The project is progressing well. We completed the auth module yesterday.",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<FactExtractionContext> = {}): FactExtractionContext {
  return {
    sessionId: "test-session-1",
    ...overrides,
  };
}

describe("SimpleFactExtractor", () => {
  const extractor = new SimpleFactExtractor();

  it("should extract a fact from a string output", async () => {
    const turns = [makeTurn()];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("experience");
    expect(result[0]?.importance).toBe(0.5);
    expect(result[0]?.content).toBe(turns[0]?.output);
  });

  it("should skip short outputs (< 20 chars)", async () => {
    const turns = [makeTurn({ output: "ok" })];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(0);
  });

  it("should skip null/undefined outputs", async () => {
    const turns = [
      makeTurn({ output: null as unknown as string }),
      makeTurn({ output: undefined as unknown as string }),
    ];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(0);
  });

  it("should return empty for empty turns array", async () => {
    const result = await extractor.extract([], makeContext());
    expect(result).toHaveLength(0);
  });

  it("should handle JSON object output", async () => {
    const jsonOutput = JSON.stringify({ result: "success", data: [1, 2, 3] });
    const turns = [makeTurn({ output: jsonOutput })];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe(jsonOutput);
  });

  it("should extract facts from multiple turns", async () => {
    const turns = [
      makeTurn({ turnNumber: 1, output: "First response with sufficient length for extraction." }),
      makeTurn({ turnNumber: 2, output: "Second response also long enough to be extracted." }),
      makeTurn({ turnNumber: 3, output: "ok" }), // too short — skipped
    ];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(2);
  });

  it("should generate pathKey from output content", async () => {
    const turns = [makeTurn({ output: "A sufficiently long output for path key generation." })];
    const result = await extractor.extract(turns, makeContext());

    expect(result).toHaveLength(1);
    expect(result[0]?.pathKey).toBeDefined();
    expect(typeof result[0]?.pathKey).toBe("string");
    expect(result[0]?.pathKey?.length).toBeGreaterThan(0);
  });

  it("should generate same pathKey for same content", async () => {
    const output = "Deterministic content for path key verification.";
    const turns1 = [makeTurn({ output })];
    const turns2 = [makeTurn({ output })];

    const result1 = await extractor.extract(turns1, makeContext());
    const result2 = await extractor.extract(turns2, makeContext());

    expect(result1[0]?.pathKey).toBe(result2[0]?.pathKey);
  });

  it("should generate different pathKey for different content", async () => {
    const turns1 = [makeTurn({ output: "First unique output for path key test." })];
    const turns2 = [makeTurn({ output: "Second unique output for path key test." })];

    const result1 = await extractor.extract(turns1, makeContext());
    const result2 = await extractor.extract(turns2, makeContext());

    expect(result1[0]?.pathKey).not.toBe(result2[0]?.pathKey);
  });
});
