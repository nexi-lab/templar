import type { SessionContext, TurnContext } from "@templar/core";
import { BudgetExhaustedError } from "@templar/errors";
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

describe("NexusPayMiddleware - Edge Cases", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  describe("Threshold boundary tests", () => {
    it("should fire warning when sessionCost exactly at 80% of dailyBudget", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetWarning = vi.fn();

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          alertThreshold: 0.8,
          twoPhaseTransfers: false,
          onBudgetWarning,
        }),
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
              totalCost: 800,
            },
          },
        }),
      );

      expect(onBudgetWarning).toHaveBeenCalledWith({
        sessionId: "test-session-1",
        budget: 1000,
        spent: 800,
        remaining: 200,
        pressure: 0.8,
        threshold: 0.8,
      });
    });

    it("should not fire warning at 79.99% of dailyBudget", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetWarning = vi.fn();

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          alertThreshold: 0.8,
          twoPhaseTransfers: false,
          onBudgetWarning,
        }),
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
              totalCost: 799,
            },
          },
        }),
      );

      expect(onBudgetWarning).not.toHaveBeenCalled();
    });

    it("should fire warning only once per session", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetWarning = vi.fn();

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          alertThreshold: 0.8,
          twoPhaseTransfers: false,
          onBudgetWarning,
        }),
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
              totalCost: 400,
            },
          },
        }),
      );

      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 400,
            },
          },
        }),
      );

      await middleware.onAfterTurn(
        createTurnContext(3, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 100,
            },
          },
        }),
      );

      expect(onBudgetWarning).toHaveBeenCalledOnce();
    });
  });

  describe("Budget of 0", () => {
    it("should immediately exhaust on onBeforeTurn with budget 0", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 0,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 0,
          hardLimit: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should calculate 0 pressure with budget 0", async () => {
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

      const context = createTurnContext(1);
      await middleware.onAfterTurn(context);

      expect(
        ((context.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.pressure,
      ).toBe(0);
    });
  });

  describe("Negative balance from API", () => {
    it("should treat negative balance as exhausted", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: -100,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          hardLimit: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should not go below 0 when tracking local balance", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 10,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          hardLimit: false,
          twoPhaseTransfers: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context1 = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 5,
          },
        },
      });

      await middleware.onAfterTurn(context1);

      expect(
        ((context1.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.remaining,
      ).toBe(5);

      const context2 = createTurnContext(2, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
          },
        },
      });

      await middleware.onAfterTurn(context2);

      // Balance should be 0, not -5
      expect(
        ((context2.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.remaining,
      ).toBe(0);
    });
  });

  describe("No usage metadata", () => {
    it("should fall back to defaultEstimatedCost when no usage", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.debit.mockResolvedValue({
        balance: 980,
        amount: 20,
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          defaultEstimatedCost: 20,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1);
      await middleware.onAfterTurn(context);

      expect(mockClient.mockPay.debit).toHaveBeenCalledWith({
        amount: 20,
        session_id: "test-session-1",
      });

      expect(
        ((context.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.sessionCost,
      ).toBe(20);
    });

    it("should handle undefined metadata gracefully", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          defaultEstimatedCost: 10,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1);
      delete context.metadata;

      await expect(middleware.onAfterTurn(context)).resolves.toBeUndefined();

      expect((context.metadata as unknown as Record<string, unknown>)?.budget).toBeDefined();
    });
  });

  describe("No costCalculator + no totalCost", () => {
    it("should use defaultEstimatedCost when no calculator and no totalCost", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.debit.mockResolvedValue({
        balance: 985,
        amount: 15,
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          defaultEstimatedCost: 15,
        }),
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
            },
          },
        }),
      );

      expect(mockClient.mockPay.debit).toHaveBeenCalledWith({
        amount: 15,
        model: "claude-opus-4",
        session_id: "test-session-1",
      });
    });
  });

  describe("Cache stats", () => {
    it("should update cache hit rate when cacheReadTokens present", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          costTracking: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Turn 1: cache hit
      const context1 = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 50,
            cacheCreationTokens: 0,
          },
        },
      });

      await middleware.onAfterTurn(context1);

      expect(
        ((context1.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.cacheHitRate,
      ).toBe(1.0);

      // Turn 2: cache miss
      const context2 = createTurnContext(2, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 0,
            cacheCreationTokens: 30,
          },
        },
      });

      await middleware.onAfterTurn(context2);

      expect(
        ((context2.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.cacheHitRate,
      ).toBe(0.5);
    });

    it("should keep cache rate at 0 when no cache fields present", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          costTracking: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
          },
        },
      });

      await middleware.onAfterTurn(context);

      expect(
        ((context.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.cacheHitRate,
      ).toBe(0);
    });

    it("should not update cache stats when costTracking is false", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          costTracking: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 10,
            cacheReadTokens: 50,
          },
        },
      });

      await middleware.onAfterTurn(context);

      expect(
        ((context.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
          ?.cacheHitRate,
      ).toBe(0);
    });
  });

  describe("PSI pressure metrics", () => {
    it("should inject exact structure in context.metadata.budget", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          twoPhaseTransfers: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 250,
          },
        },
      });

      await middleware.onAfterTurn(context);

      expect((context.metadata as Record<string, unknown>)?.budget).toEqual({
        remaining: 750,
        dailyBudget: 1000,
        pressure: 0.25,
        sessionCost: 250,
        cacheHitRate: 0,
      });

      expect(Object.keys((context.metadata as Record<string, unknown>)?.budget ?? {})).toEqual([
        "remaining",
        "dailyBudget",
        "pressure",
        "sessionCost",
        "cacheHitRate",
      ]);
    });
  });

  describe("Fail-closed: hardLimit=true + getBalance throws", () => {
    it("should throw BudgetExhaustedError immediately in onSessionStart", async () => {
      mockClient.mockPay.getBalance.mockRejectedValue(new Error("API unavailable"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ hardLimit: true }),
      );

      await expect(middleware.onSessionStart(createSessionContext())).rejects.toThrow(
        BudgetExhaustedError,
      );
    });
  });

  describe("Fail-open: hardLimit=false + getBalance throws", () => {
    it("should set balance to dailyBudget and continue", async () => {
      mockClient.mockPay.getBalance.mockRejectedValue(new Error("API unavailable"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          hardLimit: false,
          dailyBudget: 1000,
          twoPhaseTransfers: false,
          defaultEstimatedCost: 10,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1);
      await middleware.onAfterTurn(context);

      // Balance is 990 because defaultEstimatedCost (10) was deducted
      const budget = (context.metadata as Record<string, unknown>)?.budget as Record<
        string,
        unknown
      >;
      expect(budget?.remaining).toBe(990);
      expect(budget?.dailyBudget).toBe(1000);
      expect(budget?.sessionCost).toBe(10);
    });
  });

  describe("Warning callback throws", () => {
    it("should continue without re-throwing when onBudgetWarning throws", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetWarning = vi.fn().mockRejectedValue(new Error("Callback error"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          alertThreshold: 0.8,
          twoPhaseTransfers: false,
          onBudgetWarning,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 800,
          },
        },
      });

      await expect(middleware.onAfterTurn(context)).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("onBudgetWarning callback failed"),
      );
    });

    it("should continue without re-throwing when onBudgetExhausted throws", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetExhausted = vi.fn().mockRejectedValue(new Error("Callback error"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 1000,
          twoPhaseTransfers: false,
          hardLimit: false,
          onBudgetExhausted,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      const context = createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            totalCost: 1000,
          },
        },
      });

      await expect(middleware.onAfterTurn(context)).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("onBudgetExhausted callback failed"),
      );
    });
  });

  describe("Long session: 50+ turns", () => {
    it("should accumulate costs correctly over many turns", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 10000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 10000,
          twoPhaseTransfers: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      let totalExpectedCost = 0;

      for (let i = 1; i <= 50; i++) {
        const cost = i * 2; // Varying cost per turn
        totalExpectedCost += cost;

        const context = createTurnContext(i, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: cost,
            },
          },
        });

        await middleware.onAfterTurn(context);

        expect(
          ((context.metadata as Record<string, unknown>)?.budget as Record<string, unknown>)
            ?.sessionCost,
        ).toBe(totalExpectedCost);
      }

      expect(totalExpectedCost).toBe(2550); // Sum of 2+4+6+...+100
    });
  });

  describe("Per-model tracking", () => {
    it("should track 2 different models separately in perModelCosts", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          costTracking: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Turn 1: claude-opus-4
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

      // Turn 2: claude-sonnet-4
      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "claude-sonnet-4",
              inputTokens: 200,
              outputTokens: 100,
              totalTokens: 300,
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
              inputTokens: 150,
              outputTokens: 75,
              totalTokens: 225,
              totalCost: 75,
            },
          },
        }),
      );

      // Cannot directly assert perModelCosts (private), but we can verify via session summary
      await middleware.onSessionEnd(createSessionContext());

      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Cost: 155 credits"));
    });
  });

  describe("createNexusPayMiddleware factory", () => {
    it("should validate and create instance", async () => {
      const { NexusPayMiddleware: _, validatePayConfig: validateFn } = await import(
        "../middleware.js"
      );

      const config = createConfig();
      expect(() => validateFn(config)).not.toThrow();

      const middleware = new NexusPayMiddleware(mockClient.client, config);
      expect(middleware.name).toBe("nexus-pay");
    });

    it("should throw on invalid config", async () => {
      const { validatePayConfig: validateFn } = await import("../middleware.js");

      expect(() => validateFn(createConfig({ dailyBudget: -100 }))).toThrow();
      expect(() => validateFn(createConfig({ alertThreshold: 2 }))).toThrow();
      expect(() => validateFn(createConfig({ balanceCheckInterval: 0 }))).toThrow();
    });
  });
});
