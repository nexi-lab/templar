import { describe, expect, it, vi } from "vitest";
import type { Clock, ModelRequest } from "@templar/core";
import { VoiceEvolutionMiddleware } from "../../voice/middleware.js";
import type { VoiceEvolutionConfig } from "../../voice/types.js";

function createTestClock(): Clock & { advance(ms: number): void } {
  let time = 1000;
  const pending: Array<{ id: number; fn: () => void; fireAt: number }> = [];
  let nextId = 1;

  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId;
      nextId += 1;
      pending.push({ id, fn, fireAt: time + ms });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => {
      const idx = pending.findIndex((p) => p.id === (id as unknown as number));
      if (idx >= 0) pending.splice(idx, 1);
    },
    advance(ms: number) {
      time += ms;
      const toFire = pending.filter((p) => p.fireAt <= time);
      for (const timer of toFire) {
        const idx = pending.indexOf(timer);
        if (idx >= 0) pending.splice(idx, 1);
        timer.fn();
      }
    },
  };
}

function mockNexusClient(memories: Array<{ memory_id: string; content: string; memory_type: string; created_at?: string }> = []) {
  return {
    memory: {
      query: vi.fn().mockResolvedValue({ results: memories, total: memories.length }),
    },
  } as unknown as VoiceEvolutionConfig["nexusClient"];
}

describe("VoiceEvolutionMiddleware", () => {
  it("should pass through unchanged when no modifiers", async () => {
    const clock = createTestClock();
    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: mockNexusClient(),
      updateInterval: "1h",
      maxDrift: 0.2,
      clock,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    const req: ModelRequest = {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "You are helpful.",
    };

    const next = vi.fn().mockResolvedValue({ content: "response" });
    await middleware.wrapModelCall(req, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "You are helpful." }),
    );

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should inject modifiers from personality memories", async () => {
    const clock = createTestClock();
    const memories = [
      { memory_id: "m1", content: "Be concise", memory_type: "preference", created_at: "2025-01-01T00:00:00Z" },
      { memory_id: "m2", content: "Use bullet points", memory_type: "style", created_at: "2025-01-02T00:00:00Z" },
    ];

    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: mockNexusClient(memories),
      updateInterval: "1h",
      maxDrift: 0.5,
      clock,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    const req: ModelRequest = {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "Base prompt.",
    };

    const next = vi.fn().mockResolvedValue({ content: "response" });
    await middleware.wrapModelCall(req, next);

    const calledReq = next.mock.calls[0]?.[0] as ModelRequest;
    expect(calledReq.systemPrompt).toContain("Base prompt.");
    expect(calledReq.systemPrompt).toContain("Be concise");
    expect(calledReq.systemPrompt).toContain("Use bullet points");

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should handle empty systemPrompt", async () => {
    const clock = createTestClock();
    const memories = [
      { memory_id: "m1", content: "Be friendly", memory_type: "preference" },
    ];

    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: mockNexusClient(memories),
      updateInterval: "1h",
      maxDrift: 0.5,
      clock,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    const req: ModelRequest = {
      messages: [{ role: "user", content: "hello" }],
    };

    const next = vi.fn().mockResolvedValue({ content: "response" });
    await middleware.wrapModelCall(req, next);

    const calledReq = next.mock.calls[0]?.[0] as ModelRequest;
    expect(calledReq.systemPrompt).toBe("Be friendly");

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should degrade gracefully on memory query failure", async () => {
    const clock = createTestClock();
    const client = mockNexusClient();
    (client.memory.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API error"));

    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: client,
      updateInterval: "1h",
      maxDrift: 0.2,
      clock,
    });

    // Should not throw
    await middleware.onSessionStart({ sessionId: "test" });

    // Should pass through unchanged
    const req: ModelRequest = {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "Base prompt.",
    };
    const next = vi.fn().mockResolvedValue({ content: "response" });
    await middleware.wrapModelCall(req, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "Base prompt." }),
    );

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should cap modifiers at maxDrift", async () => {
    const clock = createTestClock();
    // Many memories, each would generate a modifier
    const memories = Array.from({ length: 20 }, (_, i) => ({
      memory_id: `m${i}`,
      content: `Trait ${i}`,
      memory_type: "preference",
      created_at: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));

    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: mockNexusClient(memories),
      updateInterval: "1h",
      maxDrift: 0.2, // Only 20% drift allowed
      clock,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    // Cache should have limited modifiers
    const cache = middleware.getModifierCache();
    expect(cache.totalWeight()).toBeLessThanOrEqual(0.2);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should use custom modifierBuilder", async () => {
    const clock = createTestClock();
    const customBuilder = vi.fn().mockReturnValue([
      { source: "custom", modifier: "Custom trait", weight: 0.1, createdAt: 1000 },
    ]);

    const middleware = new VoiceEvolutionMiddleware({
      nexusClient: mockNexusClient([
        { memory_id: "m1", content: "anything", memory_type: "fact" },
      ]),
      updateInterval: "1h",
      maxDrift: 0.5,
      clock,
      modifierBuilder: customBuilder,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    expect(customBuilder).toHaveBeenCalled();
    const cache = middleware.getModifierCache();
    expect(cache.size()).toBe(1);
    expect(cache.getPromptSuffix()).toBe("Custom trait");

    await middleware.onSessionEnd({ sessionId: "test" });
  });
});
