import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmObservationExtractor } from "../extractor.js";
import { parseObservations, parseReflections } from "../parser.js";
import type { ExtractionContext, ModelCallFn, TurnSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTurn(overrides?: Partial<TurnSummary>): TurnSummary {
  return {
    turnNumber: 1,
    input: "What files handle routing?",
    output: "The routing is handled by src/routes/index.ts",
    timestamp: "2026-02-18T10:00:00Z",
    ...overrides,
  };
}

function makeContext(overrides?: Partial<ExtractionContext>): ExtractionContext {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    existingObservations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseObservations
// ---------------------------------------------------------------------------

describe("parseObservations", () => {
  const ts = "2026-02-18T10:00:00Z";

  it("should parse well-formed observation lines", () => {
    const input = [
      "CRITICAL | 1,2 | User wants server components by default",
      "IMPORTANT | 3 | Agent created layout.tsx",
      "INFORMATIONAL | 4 | User mentioned font preference",
    ].join("\n");

    const result = parseObservations(input, ts);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      timestamp: ts,
      priority: "critical",
      content: "User wants server components by default",
      sourceType: "turn",
      turnNumbers: [1, 2],
    });
    expect(result[1]?.priority).toBe("important");
    expect(result[2]?.priority).toBe("informational");
  });

  it("should return empty array for empty input", () => {
    expect(parseObservations("", ts)).toEqual([]);
    expect(parseObservations("   \n  \n  ", ts)).toEqual([]);
  });

  it("should skip malformed lines gracefully", () => {
    const input = [
      "CRITICAL | 1 | Valid observation",
      "This is not a valid line",
      "UNKNOWN_PRIORITY | 2 | Bad priority",
      "IMPORTANT | 3 |",
      "IMPORTANT | 3 | Another valid one",
    ].join("\n");

    const result = parseObservations(input, ts);

    expect(result).toHaveLength(2);
    expect(result[0]?.content).toBe("Valid observation");
    expect(result[1]?.content).toBe("Another valid one");
  });

  it("should handle pipe characters in content", () => {
    const input = "CRITICAL | 1 | Error: ENOENT | file not found at /src/index.ts";
    const result = parseObservations(input, ts);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("Error: ENOENT | file not found at /src/index.ts");
  });

  it("should parse turn numbers correctly", () => {
    const input = "CRITICAL | 1,2,3,10 | Multi-turn observation";
    const result = parseObservations(input, ts);

    expect(result[0]?.turnNumbers).toEqual([1, 2, 3, 10]);
  });

  it("should handle invalid turn numbers gracefully", () => {
    const input = "CRITICAL | abc,2,NaN | Observation with bad turn nums";
    const result = parseObservations(input, ts);

    expect(result[0]?.turnNumbers).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// parseReflections
// ---------------------------------------------------------------------------

describe("parseReflections", () => {
  const ts = "2026-02-18T10:00:00Z";

  it("should parse well-formed reflection lines", () => {
    const input = [
      "REFLECTION | User prefers TypeScript with strict mode",
      "REFLECTION | Build issues are typically caused by missing imports",
    ].join("\n");

    const result = parseReflections(input, ts, 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestamp: ts,
      insight: "User prefers TypeScript with strict mode",
      sourceObservationCount: 10,
    });
  });

  it("should return empty array for empty input", () => {
    expect(parseReflections("", ts, 0)).toEqual([]);
  });

  it("should skip non-reflection lines", () => {
    const input = [
      "REFLECTION | Valid reflection",
      "Not a reflection",
      "OBSERVATION | Wrong marker",
      "REFLECTION | Another valid one",
    ].join("\n");

    const result = parseReflections(input, ts, 5);

    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// LlmObservationExtractor
// ---------------------------------------------------------------------------

describe("LlmObservationExtractor", () => {
  let mockModelCall: ReturnType<typeof vi.fn<ModelCallFn>>;
  let extractor: LlmObservationExtractor;

  beforeEach(() => {
    mockModelCall = vi.fn<ModelCallFn>();
    extractor = new LlmObservationExtractor(mockModelCall);
  });

  it("should call model with system and user prompt", async () => {
    mockModelCall.mockResolvedValue("CRITICAL | 1 | Test observation");

    const turns = [makeTurn()];
    const result = await extractor.extract(turns, makeContext());

    expect(mockModelCall).toHaveBeenCalledTimes(1);
    expect(mockModelCall.mock.calls[0]?.[0]).toContain("observation extractor");
    expect(mockModelCall.mock.calls[0]?.[1]).toContain("Turn 1");
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("Test observation");
  });

  it("should return empty array for empty turns", async () => {
    const result = await extractor.extract([], makeContext());

    expect(mockModelCall).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("should return empty array on model call failure", async () => {
    mockModelCall.mockRejectedValue(new Error("Model API timeout"));

    const result = await extractor.extract([makeTurn()], makeContext());

    expect(result).toEqual([]);
  });

  it("should include existing observations for continuity", async () => {
    mockModelCall.mockResolvedValue("IMPORTANT | 2 | New observation");

    const context = makeContext({
      existingObservations: [
        {
          timestamp: "2026-02-18T09:00:00Z",
          priority: "critical",
          content: "Existing observation",
          sourceType: "turn",
          turnNumbers: [1],
        },
      ],
    });

    await extractor.extract([makeTurn({ turnNumber: 2 })], context);

    const prompt = mockModelCall.mock.calls[0]?.[1] as string;
    expect(prompt).toContain("Previous Observations");
    expect(prompt).toContain("Existing observation");
  });

  it("should handle tool calls in turn summaries", async () => {
    mockModelCall.mockResolvedValue("CRITICAL | 1 | Tool result captured");

    const turn = makeTurn({
      toolCalls: [
        { name: "read_file", result: '{"content": "file data"}' },
        { name: "search", result: "3 results found" },
      ],
    });

    await extractor.extract([turn], makeContext());

    const prompt = mockModelCall.mock.calls[0]?.[1] as string;
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("search");
  });

  it("should truncate very long turn content", async () => {
    mockModelCall.mockResolvedValue("INFORMATIONAL | 1 | Long content processed");

    const turn = makeTurn({
      input: "a".repeat(10_000),
      output: "b".repeat(10_000),
    });

    await extractor.extract([turn], makeContext());

    const prompt = mockModelCall.mock.calls[0]?.[1] as string;
    // Prompt should be truncated, not 20K+ characters
    expect(prompt.length).toBeLessThan(16_000);
  });
});
