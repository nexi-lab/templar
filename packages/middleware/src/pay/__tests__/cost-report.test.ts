import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusPayMiddleware } from "../middleware.js";
import type { NexusPayConfig } from "../types.js";

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    userId: "test-user",
    ...overrides,
  };
}

function createTurnContext(turnNumber: number, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    sessionId: "test-session-1",
    turnNumber,
    output: "Response from LLM",
    ...overrides,
  };
}

function createConfig(overrides: Partial<NexusPayConfig> = {}): NexusPayConfig {
  return {
    dailyBudget: 1000,
    ...overrides,
  };
}

describe("NexusPayMiddleware - getCostReport()", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("should return correct structure with empty session", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    const report = middleware.getCostReport("test-session-1");

    expect(report.sessionId).toBe("test-session-1");
    expect(report.totalCost).toBe(0);
    expect(report.totalTokens).toEqual({ input: 0, output: 0, total: 0 });
    expect(report.breakdown.byModel.size).toBe(0);
    expect(report.cache).toEqual({
      hits: 0,
      misses: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(report.budget).toEqual({
      used: 0,
      limit: 1000,
      remaining: 1000,
      pressure: 0,
    });
    expect(report.turnCount).toBe(0);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should return correct totalCost after a single turn", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());
    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            totalCost: 50,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.totalCost).toBe(50);
    expect(report.turnCount).toBe(1);
  });

  it("should return correct totalTokens after a single turn", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            totalCost: 50,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.totalTokens).toEqual({ input: 200, output: 100, total: 300 });
  });

  it("should return correct breakdown.byModel with a single model", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            totalCost: 50,
            cacheReadTokens: 30,
            cacheCreationTokens: 10,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");
    const opusEntry = report.breakdown.byModel.get("claude-opus-4");

    expect(opusEntry).toBeDefined();
    expect(opusEntry).toEqual({
      totalCost: 50,
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      requestCount: 1,
      cacheReadTokens: 30,
      cacheCreationTokens: 10,
    });
  });

  it("should return correct breakdown.byModel with multiple models", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ dailyBudget: 5000, twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Turn 1: claude-opus-4
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            totalCost: 50,
          },
        },
      }),
    );

    // Turn 2: claude-sonnet-4
    await middleware.onAfterTurn(
      createTurnContext(2, {
        metadata: {
          usage: {
            model: "claude-sonnet-4",
            inputTokens: 500,
            outputTokens: 250,
            totalTokens: 750,
            totalCost: 30,
          },
        },
      }),
    );

    // Turn 3: claude-opus-4 again
    await middleware.onAfterTurn(
      createTurnContext(3, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 300,
            outputTokens: 150,
            totalTokens: 450,
            totalCost: 75,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.breakdown.byModel.size).toBe(2);

    const opusEntry = report.breakdown.byModel.get("claude-opus-4");
    expect(opusEntry).toEqual({
      totalCost: 125,
      inputTokens: 500,
      outputTokens: 250,
      totalTokens: 750,
      requestCount: 2,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    const sonnetEntry = report.breakdown.byModel.get("claude-sonnet-4");
    expect(sonnetEntry).toEqual({
      totalCost: 30,
      inputTokens: 500,
      outputTokens: 250,
      totalTokens: 750,
      requestCount: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("should accumulate totals across multiple turns", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ dailyBudget: 5000, twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    for (let i = 1; i <= 5; i++) {
      await middleware.onBeforeTurn(createTurnContext(i));
      await middleware.onAfterTurn(
        createTurnContext(i, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100 * i,
              outputTokens: 50 * i,
              totalTokens: 150 * i,
              totalCost: 10 * i,
            },
          },
        }),
      );
    }

    const report = middleware.getCostReport("test-session-1");

    // totalCost = 10 + 20 + 30 + 40 + 50 = 150
    expect(report.totalCost).toBe(150);
    // totalTokens.input = 100 + 200 + 300 + 400 + 500 = 1500
    expect(report.totalTokens.input).toBe(1500);
    // totalTokens.output = 50 + 100 + 150 + 200 + 250 = 750
    expect(report.totalTokens.output).toBe(750);
    // totalTokens.total = 150 + 300 + 450 + 600 + 750 = 2250
    expect(report.totalTokens.total).toBe(2250);
    expect(report.turnCount).toBe(5);
  });

  it("should return correct cache stats", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Turn 1: cache hit
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 40,
            cacheCreationTokens: 0,
          },
        },
      }),
    );

    // Turn 2: cache miss (creation)
    await middleware.onAfterTurn(
      createTurnContext(2, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 0,
            cacheCreationTokens: 25,
          },
        },
      }),
    );

    // Turn 3: cache hit
    await middleware.onAfterTurn(
      createTurnContext(3, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 60,
            cacheCreationTokens: 0,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.cache).toEqual({
      hits: 2,
      misses: 1,
      cacheReadTokens: 100,
      cacheCreationTokens: 25,
    });
  });

  it("should return correct budget summary", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ dailyBudget: 1000, twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 250,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.budget).toEqual({
      used: 250,
      limit: 1000,
      remaining: 750,
      pressure: 0.25,
    });
  });

  it("should return 0 pressure with zero dailyBudget", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 0,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({
        dailyBudget: 0,
        hardLimit: false,
        twoPhaseTransfers: false,
      }),
    );

    await middleware.onSessionStart(createSessionContext());
    await middleware.onAfterTurn(createTurnContext(1));

    const report = middleware.getCostReport("test-session-1");

    expect(report.budget.pressure).toBe(0);
  });

  it("should return empty byModel when costTracking is false", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false, costTracking: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 50,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    // Cost should still be tracked
    expect(report.totalCost).toBe(50);
    // But per-model breakdown should be empty
    expect(report.breakdown.byModel.size).toBe(0);
    // And total tokens should be 0 (no per-model data to aggregate)
    expect(report.totalTokens).toEqual({ input: 0, output: 0, total: 0 });
  });

  it("should be idempotent — same result on repeated calls", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 50,
          },
        },
      }),
    );

    const report1 = middleware.getCostReport("test-session-1");
    const report2 = middleware.getCostReport("test-session-1");

    expect(report1.totalCost).toBe(report2.totalCost);
    expect(report1.turnCount).toBe(report2.turnCount);
    expect(report1.totalTokens).toEqual(report2.totalTokens);
    expect(report1.budget).toEqual(report2.budget);
    expect(report1.cache).toEqual(report2.cache);

    // byModel should have same entries
    expect(report1.breakdown.byModel.size).toBe(report2.breakdown.byModel.size);
    for (const [model, entry] of report1.breakdown.byModel) {
      expect(report2.breakdown.byModel.get(model)).toEqual(entry);
    }
  });

  it("should return ReadonlyMap for byModel", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 50,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    // Verify it's a Map (ReadonlyMap at type level)
    expect(report.breakdown.byModel).toBeInstanceOf(Map);
    expect(report.breakdown.byModel.has("claude-opus-4")).toBe(true);
  });

  it("should return valid ISO-8601 generatedAt timestamp", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 1000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    const beforeTime = new Date().getTime();
    const report = middleware.getCostReport("test-session-1");
    const afterTime = new Date().getTime();

    const reportTime = new Date(report.generatedAt).getTime();
    expect(reportTime).toBeGreaterThanOrEqual(beforeTime);
    expect(reportTime).toBeLessThanOrEqual(afterTime);
  });

  it("should handle mixed models with cache hits in a multi-turn session", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ dailyBudget: 5000, twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Turn 1: opus with cache hit
    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            totalCost: 60,
            cacheReadTokens: 80,
            cacheCreationTokens: 0,
          },
        },
      }),
    );

    // Turn 2: sonnet with cache creation
    await middleware.onBeforeTurn(createTurnContext(2));
    await middleware.onAfterTurn(
      createTurnContext(2, {
        metadata: {
          usage: {
            model: "claude-sonnet-4",
            inputTokens: 400,
            outputTokens: 200,
            totalTokens: 600,
            totalCost: 25,
            cacheReadTokens: 0,
            cacheCreationTokens: 100,
          },
        },
      }),
    );

    // Turn 3: opus with cache hit
    await middleware.onBeforeTurn(createTurnContext(3));
    await middleware.onAfterTurn(
      createTurnContext(3, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 150,
            outputTokens: 75,
            totalTokens: 225,
            totalCost: 40,
            cacheReadTokens: 60,
            cacheCreationTokens: 0,
          },
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.totalCost).toBe(125);
    expect(report.totalTokens).toEqual({ input: 750, output: 375, total: 1125 });
    expect(report.turnCount).toBe(3);

    // 2 models tracked
    expect(report.breakdown.byModel.size).toBe(2);

    const opusEntry = report.breakdown.byModel.get("claude-opus-4");
    expect(opusEntry?.totalCost).toBe(100);
    expect(opusEntry?.requestCount).toBe(2);
    expect(opusEntry?.cacheReadTokens).toBe(140);

    const sonnetEntry = report.breakdown.byModel.get("claude-sonnet-4");
    expect(sonnetEntry?.totalCost).toBe(25);
    expect(sonnetEntry?.requestCount).toBe(1);
    expect(sonnetEntry?.cacheCreationTokens).toBe(100);

    // Cache: 2 hits, 1 miss
    expect(report.cache.hits).toBe(2);
    expect(report.cache.misses).toBe(1);
    expect(report.cache.cacheReadTokens).toBe(140);
    expect(report.cache.cacheCreationTokens).toBe(100);

    // Budget: 125/5000
    expect(report.budget.used).toBe(125);
    expect(report.budget.pressure).toBeCloseTo(0.025);
  });
});
