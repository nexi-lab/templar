import { describe, expect, it, vi } from "vitest";
import { DistillationMiddleware } from "../../distillation/middleware.js";
import type { DistillationConfig, MemoryExtractor, ExtractedMemory } from "../../distillation/types.js";

function mockNexusClient() {
  return {
    memory: {
      batchStore: vi.fn().mockResolvedValue({ stored: 0, failed: 0 }),
    },
  } as unknown as DistillationConfig["nexusClient"];
}

function mockExtractor(memories: readonly ExtractedMemory[] = []): MemoryExtractor {
  return {
    extract: vi.fn().mockResolvedValue(memories),
  };
}

describe("DistillationMiddleware", () => {
  it("should buffer turns", async () => {
    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor: mockExtractor(),
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 2, input: "how?", output: "fine" });

    expect(middleware.getTurnBuffer()).toHaveLength(2);
  });

  it("should respect maxTurns window", async () => {
    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor: mockExtractor(),
      maxTurns: 3,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    for (let i = 1; i <= 5; i++) {
      await middleware.onAfterTurn({
        sessionId: "test",
        turnNumber: i,
        input: `input-${i}`,
        output: `output-${i}`,
      });
    }

    expect(middleware.getTurnBuffer()).toHaveLength(3);
    // Should keep the last 3 turns
    const buffer = middleware.getTurnBuffer();
    expect(buffer[0]?.turnNumber).toBe(3);
    expect(buffer[2]?.turnNumber).toBe(5);
  });

  it("should extract and store on session end", async () => {
    const client = mockNexusClient();
    const memories: ExtractedMemory[] = [
      { content: "User likes TypeScript", category: "preference", confidence: 0.8 },
      { content: "Decided to use picomatch", category: "decision", confidence: 0.7 },
    ];
    const extractor = mockExtractor(memories);

    const middleware = new DistillationMiddleware({
      nexusClient: client,
      extractor,
      triggers: ["session_end"],
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });
    await middleware.onSessionEnd({ sessionId: "test" });

    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(client.memory.batchStore).toHaveBeenCalledTimes(1);

    const diagnostics = middleware.getDiagnostics();
    expect(diagnostics.extractionCount).toBe(1);
    expect(diagnostics.memoriesStored).toBe(2);
  });

  it("should filter by minConfidence", async () => {
    const client = mockNexusClient();
    const memories: ExtractedMemory[] = [
      { content: "High confidence", category: "fact", confidence: 0.9 },
      { content: "Low confidence", category: "fact", confidence: 0.1 },
    ];
    const extractor = mockExtractor(memories);

    const middleware = new DistillationMiddleware({
      nexusClient: client,
      extractor,
      minConfidence: 0.5,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });
    await middleware.onSessionEnd({ sessionId: "test" });

    // Only the high-confidence memory should be stored
    const storeCall = (client.memory.batchStore as ReturnType<typeof vi.fn>).mock.calls[0];
    const storedMemories = storeCall?.[0]?.memories;
    expect(storedMemories).toHaveLength(1);
    expect(storedMemories?.[0]?.content).toBe("High confidence");
  });

  it("should not extract when buffer is empty", async () => {
    const extractor = mockExtractor();

    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onSessionEnd({ sessionId: "test" });

    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("should extract on context_compact trigger", async () => {
    const extractor = mockExtractor([
      { content: "Extracted", category: "fact", confidence: 0.8 },
    ]);
    const client = mockNexusClient();

    const middleware = new DistillationMiddleware({
      nexusClient: client,
      extractor,
      triggers: ["context_compact"],
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });

    // Simulate context compact
    await middleware.onAfterTurn({
      sessionId: "test",
      turnNumber: 2,
      input: "compact",
      output: "compacted",
      metadata: { contextCompacted: true },
    });

    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(client.memory.batchStore).toHaveBeenCalledTimes(1);
  });

  it("should not extract on context_compact if not in triggers", async () => {
    const extractor = mockExtractor();

    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor,
      triggers: ["session_end"],
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({
      sessionId: "test",
      turnNumber: 1,
      input: "compact",
      output: "compacted",
      metadata: { contextCompacted: true },
    });

    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("should clear buffer after successful extraction", async () => {
    const extractor = mockExtractor([
      { content: "Memory", category: "fact", confidence: 0.8 },
    ]);

    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });
    await middleware.onSessionEnd({ sessionId: "test" });

    expect(middleware.getTurnBuffer()).toHaveLength(0);
  });

  it("should degrade gracefully on extraction failure", async () => {
    const extractor: MemoryExtractor = {
      extract: vi.fn().mockRejectedValue(new Error("LLM error")),
    };

    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });

    // Should not throw
    await middleware.onSessionEnd({ sessionId: "test" });

    // Buffer should be preserved (not cleared on failure)
    expect(middleware.getTurnBuffer()).toHaveLength(1);
  });

  it("should degrade gracefully on storage failure", async () => {
    const client = mockNexusClient();
    (client.memory.batchStore as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Storage error"),
    );
    const extractor = mockExtractor([
      { content: "Memory", category: "fact", confidence: 0.8 },
    ]);

    const middleware = new DistillationMiddleware({
      nexusClient: client,
      extractor,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({ sessionId: "test", turnNumber: 1, input: "hi", output: "hello" });

    // Should not throw
    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should handle non-string input/output", async () => {
    const extractor = mockExtractor();

    const middleware = new DistillationMiddleware({
      nexusClient: mockNexusClient(),
      extractor,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    await middleware.onAfterTurn({
      sessionId: "test",
      turnNumber: 1,
      input: { type: "tool_result", content: "data" },
      output: { type: "tool_call", name: "search" },
    });

    const buffer = middleware.getTurnBuffer();
    expect(buffer).toHaveLength(1);
    // Should be serialized to string
    expect(typeof buffer[0]?.input).toBe("string");
    expect(typeof buffer[0]?.output).toBe("string");
  });
});
