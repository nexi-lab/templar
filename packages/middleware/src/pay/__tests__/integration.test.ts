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
    dailyBudget: 5000,
    ...overrides,
  };
}

describe("NexusPayMiddleware - ModelRouter Integration", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("should prefer direct metadata.usage over modelRouter:usage", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
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
          // Direct usage (priority 1)
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 30,
          },
          // Router usage (priority 2 — should be ignored)
          "modelRouter:usage": [
            {
              model: "claude-sonnet-4",
              usage: {
                inputTokens: 999,
                outputTokens: 999,
                totalTokens: 1998,
                totalCost: 999,
              },
            },
          ],
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    // Should use direct usage, not router usage
    expect(report.totalCost).toBe(30);
    expect(report.breakdown.byModel.has("claude-opus-4")).toBe(true);
    expect(report.breakdown.byModel.has("claude-sonnet-4")).toBe(false);
  });

  it("should aggregate multiple ModelRouter usage events", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Turn with multiple router usage events (retries/fallbacks)
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          "modelRouter:usage": [
            {
              model: "claude-opus-4",
              usage: {
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                totalCost: 20,
                cacheReadTokens: 30,
              },
            },
            {
              model: "claude-sonnet-4",
              usage: {
                inputTokens: 200,
                outputTokens: 100,
                totalTokens: 300,
                totalCost: 15,
                cacheCreationTokens: 40,
              },
            },
          ],
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    // Cost should be the aggregated total: 20 + 15 = 35
    expect(report.totalCost).toBe(35);

    // Token totals should aggregate
    expect(report.totalTokens).toEqual({
      input: 300,
      output: 150,
      total: 450,
    });

    // Model attribution uses last model in the event list
    // (aggregated into single usage with model from last valid event)
    expect(report.breakdown.byModel.size).toBe(1);
    const entry = report.breakdown.byModel.get("claude-sonnet-4");
    expect(entry).toBeDefined();
    expect(entry?.totalCost).toBe(35);
    expect(entry?.inputTokens).toBe(300);
    expect(entry?.cacheReadTokens).toBe(30);
    expect(entry?.cacheCreationTokens).toBe(40);
  });

  it("should ignore invalid events in modelRouter:usage array", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({ twoPhaseTransfers: false, defaultEstimatedCost: 5 }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          "modelRouter:usage": [
            null,
            "invalid",
            { model: "x" }, // Missing usage
            { model: "y", usage: "not_object" },
            { model: "z", usage: { inputTokens: "string" } }, // Wrong types
            {
              model: "claude-opus-4",
              usage: {
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                totalCost: 25,
              },
            },
          ],
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    // Only the valid event should be counted
    expect(report.totalCost).toBe(25);
    expect(report.breakdown.byModel.has("claude-opus-4")).toBe(true);
  });

  it("should fall back to defaultEstimatedCost when modelRouter:usage is empty", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({
        twoPhaseTransfers: false,
        defaultEstimatedCost: 42,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          "modelRouter:usage": [],
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.totalCost).toBe(42);
    expect(report.breakdown.byModel.size).toBe(0);
  });

  it("should fall back to defaultEstimatedCost when modelRouter:usage has only invalid events", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({
        twoPhaseTransfers: false,
        defaultEstimatedCost: 33,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          "modelRouter:usage": [null, "string", 42, { bad: true }],
        },
      }),
    );

    const report = middleware.getCostReport("test-session-1");

    expect(report.totalCost).toBe(33);
  });
});
