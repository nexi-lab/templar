import { describe, expect, it } from "vitest";
import { DefaultMemoryExtractor } from "../../distillation/default-extractor.js";

describe("DefaultMemoryExtractor", () => {
  const extractor = new DefaultMemoryExtractor();
  const context = { sessionId: "test" };

  it("should return empty array for no turns", async () => {
    const result = await extractor.extract([], context);
    expect(result).toEqual([]);
  });

  it("should extract decision patterns", async () => {
    const turns = [
      { turnNumber: 1, input: "Should we use React?", output: "We decided to use React for the frontend." },
    ];

    const result = await extractor.extract(turns, context);
    expect(result.some((m) => m.category === "decision")).toBe(true);
  });

  it("should extract preference patterns", async () => {
    const turns = [
      { turnNumber: 1, input: "What language?", output: "I prefer TypeScript for type safety." },
    ];

    const result = await extractor.extract(turns, context);
    expect(result.some((m) => m.category === "preference")).toBe(true);
  });

  it("should extract action item patterns", async () => {
    const turns = [
      { turnNumber: 1, input: "What's next?", output: "We need to update the documentation." },
    ];

    const result = await extractor.extract(turns, context);
    expect(result.some((m) => m.category === "action_item")).toBe(true);
  });

  it("should include source context", async () => {
    const turns = [
      { turnNumber: 3, input: "Decided?", output: "We have decided on the approach." },
    ];

    const result = await extractor.extract(turns, context);
    expect(result[0]?.sourceContext).toBe("Turn 3");
  });

  it("should handle turns with no extractable patterns", async () => {
    const turns = [
      { turnNumber: 1, input: "Hello", output: "Hi there! How can I help you?" },
    ];

    const result = await extractor.extract(turns, context);
    expect(result).toHaveLength(0);
  });
});
