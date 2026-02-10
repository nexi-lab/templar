import type { SessionContext, TurnContext } from "@templar/core";
import { BudgetExhaustedError, PayConfigurationError } from "@templar/errors";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusPayMiddleware, validatePayConfig } from "../middleware.js";
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

describe("NexusPayMiddleware", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  describe("constructor and name", () => {
    it("should create middleware with required config", () => {
      const middleware = new NexusPayMiddleware(mockClient.client, createConfig());
      expect(middleware.name).toBe("nexus-pay");
    });

    it("should apply default config values", () => {
      const middleware = new NexusPayMiddleware(mockClient.client, createConfig());
      expect(middleware).toBeDefined();
    });

    it("should allow full config customization", () => {
      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          dailyBudget: 5000,
          alertThreshold: 0.9,
          hardLimit: false,
          costTracking: false,
          twoPhaseTransfers: false,
          balanceCheckInterval: 10,
          balanceCheckTimeoutMs: 5000,
          transferTimeoutMs: 8000,
          reconciliationTimeoutMs: 4000,
          defaultEstimatedCost: 20,
        }),
      );
      expect(middleware).toBeDefined();
    });
  });

  describe("validatePayConfig", () => {
    it("should accept valid config", () => {
      expect(() => validatePayConfig(createConfig())).not.toThrow();
    });

    it("should accept dailyBudget of 0", () => {
      expect(() => validatePayConfig(createConfig({ dailyBudget: 0 }))).not.toThrow();
    });

    it("should reject negative dailyBudget", () => {
      expect(() => validatePayConfig(createConfig({ dailyBudget: -100 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ dailyBudget: -100 }))).toThrow(
        /dailyBudget must be >= 0/,
      );
    });

    it("should reject alertThreshold below 0", () => {
      expect(() => validatePayConfig(createConfig({ alertThreshold: -0.1 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ alertThreshold: -0.1 }))).toThrow(
        /alertThreshold must be between 0 and 1/,
      );
    });

    it("should reject alertThreshold above 1", () => {
      expect(() => validatePayConfig(createConfig({ alertThreshold: 1.5 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ alertThreshold: 1.5 }))).toThrow(
        /alertThreshold must be between 0 and 1/,
      );
    });

    it("should accept alertThreshold of 0 and 1", () => {
      expect(() => validatePayConfig(createConfig({ alertThreshold: 0 }))).not.toThrow();
      expect(() => validatePayConfig(createConfig({ alertThreshold: 1 }))).not.toThrow();
    });

    it("should reject balanceCheckInterval below 1", () => {
      expect(() => validatePayConfig(createConfig({ balanceCheckInterval: 0 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ balanceCheckInterval: 0 }))).toThrow(
        /balanceCheckInterval must be >= 1/,
      );
    });

    it("should reject negative balanceCheckTimeoutMs", () => {
      expect(() => validatePayConfig(createConfig({ balanceCheckTimeoutMs: -1 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ balanceCheckTimeoutMs: -1 }))).toThrow(
        /balanceCheckTimeoutMs must be >= 0/,
      );
    });

    it("should reject negative transferTimeoutMs", () => {
      expect(() => validatePayConfig(createConfig({ transferTimeoutMs: -500 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ transferTimeoutMs: -500 }))).toThrow(
        /transferTimeoutMs must be >= 0/,
      );
    });

    it("should reject negative reconciliationTimeoutMs", () => {
      expect(() => validatePayConfig(createConfig({ reconciliationTimeoutMs: -100 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ reconciliationTimeoutMs: -100 }))).toThrow(
        /reconciliationTimeoutMs must be >= 0/,
      );
    });

    it("should reject negative defaultEstimatedCost", () => {
      expect(() => validatePayConfig(createConfig({ defaultEstimatedCost: -5 }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ defaultEstimatedCost: -5 }))).toThrow(
        /defaultEstimatedCost must be >= 0/,
      );
    });
  });

  describe("onSessionStart", () => {
    it("should fetch balance successfully", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 500,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(mockClient.client, createConfig());
      await middleware.onSessionStart(createSessionContext());

      expect(mockClient.mockPay.getBalance).toHaveBeenCalledOnce();
    });

    it("should handle timeout during balance fetch", async () => {
      mockClient.mockPay.getBalance.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          balanceCheckTimeoutMs: 100,
          hardLimit: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("balance query timed out"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("continuing with dailyBudget as balance"),
      );
    });

    it("should throw BudgetExhaustedError on failure with hardLimit=true", async () => {
      mockClient.mockPay.getBalance.mockRejectedValue(new Error("Network error"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ hardLimit: true }),
      );

      await expect(middleware.onSessionStart(createSessionContext())).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should warn and continue on failure with hardLimit=false", async () => {
      mockClient.mockPay.getBalance.mockRejectedValue(new Error("Network error"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          hardLimit: false,
          dailyBudget: 1000,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Should have been called with both parts of the message
      expect(consoleWarnSpy).toHaveBeenCalled();
      const calls = consoleWarnSpy.mock.calls.map((call: unknown[]) => call[0]);
      const hasNetworkError = calls.some((msg: string) => msg.includes("Network error"));
      const hasContinuing = calls.some((msg: string) =>
        msg.includes("continuing with dailyBudget"),
      );

      expect(hasNetworkError).toBe(true);
      expect(hasContinuing).toBe(true);
    });

    it("should use dailyBudget as fallback balance when hardLimit=false", async () => {
      mockClient.mockPay.getBalance.mockRejectedValue(new Error("API down"));
      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 990,
        amount: 10,
        status: "reserved",
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          hardLimit: false,
          dailyBudget: 1000,
          twoPhaseTransfers: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      // Should not throw because balance was set to dailyBudget
      expect(mockClient.mockPay.transfer).toHaveBeenCalled();
    });
  });

  describe("onBeforeTurn", () => {
    it("should check budget and throw when exhausted with hardLimit=true", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 0,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ hardLimit: true }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should not throw when exhausted with hardLimit=false", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 0,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          hardLimit: false,
          twoPhaseTransfers: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).resolves.toBeUndefined();
    });

    it("should reserve credits with twoPhaseTransfers=true", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 990,
        amount: 10,
        status: "reserved",
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          defaultEstimatedCost: 10,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      expect(mockClient.mockPay.transfer).toHaveBeenCalledWith({
        amount: 10,
        phase: "reserve",
        description: expect.stringContaining("turn 1 estimate"),
      });
    });

    it("should reconcile balance on interval when twoPhaseTransfers=false", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          balanceCheckInterval: 5,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Clear the mock calls from session start
      mockClient.mockPay.getBalance.mockClear();

      // Turns 1-4 should not reconcile
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onBeforeTurn(createTurnContext(3));
      await middleware.onBeforeTurn(createTurnContext(4));

      expect(mockClient.mockPay.getBalance).not.toHaveBeenCalled();

      // Turn 5 should trigger reconciliation
      await middleware.onBeforeTurn(createTurnContext(5));

      expect(mockClient.mockPay.getBalance).toHaveBeenCalledOnce();
    });
  });

  describe("onAfterTurn", () => {
    it("should commit transfer with twoPhaseTransfers=true", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 990,
        amount: 10,
        status: "reserved",
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          defaultEstimatedCost: 10,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 985,
        amount: 15,
        status: "committed",
        created_at: "2026-02-10T12:00:00Z",
      });

      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 15,
            },
          },
        }),
      );

      expect(mockClient.mockPay.transfer).toHaveBeenCalledWith({
        amount: 15,
        phase: "commit",
        transfer_id: "t1",
      });
    });

    it("should track cost via costCalculator", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const costCalculator = vi.fn((model: string) => {
        return model === "claude-opus-4" ? 50 : 10;
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          costCalculator,
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

      expect(costCalculator).toHaveBeenCalledWith("claude-opus-4", {
        model: "claude-opus-4",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it("should track cost via totalCost fallback", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.debit.mockResolvedValue({
        balance: 975,
        amount: 25,
        created_at: "2026-02-10T12:00:00Z",
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
              model: "claude-sonnet-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 25,
            },
          },
        }),
      );

      expect(mockClient.mockPay.debit).toHaveBeenCalledWith({
        amount: 25,
        model: "claude-sonnet-4",
        session_id: "test-session-1",
      });
    });

    it("should inject PSI metrics into context metadata", async () => {
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
            totalCost: 100,
          },
        },
      });

      await middleware.onAfterTurn(context);

      expect(context.metadata?.budget).toEqual({
        remaining: 900,
        dailyBudget: 1000,
        pressure: 0.1,
        sessionCost: 100,
        cacheHitRate: 0,
      });
    });

    it("should fire budget warning callback when threshold crossed", async () => {
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

    it("should fire onBudgetExhausted callback when budget is depleted", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const onBudgetExhausted = vi.fn();

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

      await middleware.onAfterTurn(
        createTurnContext(1, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 1000,
            },
          },
        }),
      );

      expect(onBudgetExhausted).toHaveBeenCalledWith({
        sessionId: "test-session-1",
        budget: 1000,
        spent: 1000,
      });
    });
  });

  describe("onSessionEnd", () => {
    it("should release outstanding transfers", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 990,
        amount: 10,
        status: "reserved",
        created_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ twoPhaseTransfers: true }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      mockClient.mockPay.transfer.mockClear();
      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 1000,
        amount: 0,
        status: "released",
        created_at: "2026-02-10T12:00:00Z",
      });

      await middleware.onSessionEnd(createSessionContext());

      expect(mockClient.mockPay.transfer).toHaveBeenCalledWith({
        amount: 0,
        phase: "release",
        transfer_id: "t1",
      });
    });

    it("should perform final reconciliation", async () => {
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

      mockClient.mockPay.getBalance.mockClear();
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 850,
        currency: "credits",
        updated_at: "2026-02-10T12:01:00Z",
      });

      await middleware.onSessionEnd(createSessionContext());

      expect(mockClient.mockPay.getBalance).toHaveBeenCalledOnce();
    });

    it("should log session summary", async () => {
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
      await middleware.onBeforeTurn(createTurnContext(1)); // This increments turn count
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

      await middleware.onSessionEnd(createSessionContext());

      // Should be called with a single string containing all info
      const logMessage = consoleInfoSpy.mock.calls[0]?.[0];
      expect(logMessage).toContain("Session test-session-1: completed");
      expect(logMessage).toContain("Cost: 50 credits");
      expect(logMessage).toContain("turns: 1");
    });

    it("should handle reconciliation timeout gracefully", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          reconciliationTimeoutMs: 100,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      mockClient.mockPay.getBalance.mockClear();
      mockClient.mockPay.getBalance.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      await expect(middleware.onSessionEnd(createSessionContext())).resolves.toBeUndefined();
    });
  });
});
