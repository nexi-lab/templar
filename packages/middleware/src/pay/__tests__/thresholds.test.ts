import type { SessionContext, TurnContext } from "@templar/core";
import { PayConfigurationError } from "@templar/errors";
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

function createUsageTurn(turnNumber: number, totalCost: number): TurnContext {
  return createTurnContext(turnNumber, {
    metadata: {
      usage: {
        model: "claude-opus-4",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCost,
      },
    },
  });
}

describe("NexusPayMiddleware - Multi-Threshold Warnings", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("should fire at each threshold in alertThresholds array", async () => {
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
        alertThresholds: [0.5, 0.8, 1.0],
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // 50% threshold — cost reaches 500/1000
    await middleware.onAfterTurn(createUsageTurn(1, 500));
    expect(onBudgetWarning).toHaveBeenCalledTimes(1);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(
      expect.objectContaining({ threshold: 0.5, spent: 500, pressure: 0.5 }),
    );

    // 80% threshold — cost reaches 800/1000
    await middleware.onAfterTurn(createUsageTurn(2, 300));
    expect(onBudgetWarning).toHaveBeenCalledTimes(2);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(
      expect.objectContaining({ threshold: 0.8, spent: 800, pressure: 0.8 }),
    );

    // 100% threshold — cost reaches 1000/1000
    await middleware.onAfterTurn(createUsageTurn(3, 200));
    expect(onBudgetWarning).toHaveBeenCalledTimes(3);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(
      expect.objectContaining({ threshold: 1.0, spent: 1000, pressure: 1.0 }),
    );
  });

  it("should support alertThresholds as a single number", async () => {
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
        alertThresholds: 0.75,
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Below threshold
    await middleware.onAfterTurn(createUsageTurn(1, 700));
    expect(onBudgetWarning).not.toHaveBeenCalled();

    // At threshold
    await middleware.onAfterTurn(createUsageTurn(2, 50));
    expect(onBudgetWarning).toHaveBeenCalledOnce();
    expect(onBudgetWarning).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.75 }));
  });

  it("should fall back to deprecated alertThreshold when alertThresholds is not set", async () => {
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
        alertThreshold: 0.9,
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    await middleware.onAfterTurn(createUsageTurn(1, 900));

    expect(onBudgetWarning).toHaveBeenCalledOnce();
    expect(onBudgetWarning).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.9 }));
  });

  it("should prioritize alertThresholds over deprecated alertThreshold", async () => {
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
        alertThreshold: 0.9,
        alertThresholds: [0.5],
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Should fire at 0.5, not 0.9
    await middleware.onAfterTurn(createUsageTurn(1, 500));
    expect(onBudgetWarning).toHaveBeenCalledOnce();
    expect(onBudgetWarning).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.5 }));

    // Should NOT fire at 0.9 because alertThresholds doesn't include it
    await middleware.onAfterTurn(createUsageTurn(2, 400));
    expect(onBudgetWarning).toHaveBeenCalledOnce();
  });

  it("should use default thresholds [0.5, 0.8, 1.0] when neither is configured", async () => {
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
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // 50%
    await middleware.onAfterTurn(createUsageTurn(1, 500));
    expect(onBudgetWarning).toHaveBeenCalledTimes(1);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(expect.objectContaining({ threshold: 0.5 }));

    // 80%
    await middleware.onAfterTurn(createUsageTurn(2, 300));
    expect(onBudgetWarning).toHaveBeenCalledTimes(2);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(expect.objectContaining({ threshold: 0.8 }));

    // 100%
    await middleware.onAfterTurn(createUsageTurn(3, 200));
    expect(onBudgetWarning).toHaveBeenCalledTimes(3);
    expect(onBudgetWarning).toHaveBeenLastCalledWith(expect.objectContaining({ threshold: 1.0 }));
  });

  it("should fire each threshold only once per session", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const onBudgetWarning = vi.fn();

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({
        dailyBudget: 1000,
        alertThresholds: [0.5, 0.8],
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // First turn: crosses both 50% and 80%
    await middleware.onAfterTurn(createUsageTurn(1, 850));
    expect(onBudgetWarning).toHaveBeenCalledTimes(2);

    // Second turn: still above 80%, should NOT re-fire
    await middleware.onAfterTurn(createUsageTurn(2, 50));
    expect(onBudgetWarning).toHaveBeenCalledTimes(2);

    // Third turn: more cost, still should NOT re-fire
    await middleware.onAfterTurn(createUsageTurn(3, 50));
    expect(onBudgetWarning).toHaveBeenCalledTimes(2);
  });

  it("should fire multiple thresholds in a single turn if all crossed", async () => {
    mockClient.mockPay.getBalance.mockResolvedValue({
      balance: 5000,
      currency: "credits",
      updated_at: "2026-02-10T12:00:00Z",
    });

    const onBudgetWarning = vi.fn();
    const firedThresholds: number[] = [];
    onBudgetWarning.mockImplementation((event: { threshold: number }) => {
      firedThresholds.push(event.threshold);
    });

    const middleware = new NexusPayMiddleware(
      mockClient.client,
      createConfig({
        dailyBudget: 1000,
        alertThresholds: [0.25, 0.5, 0.75, 1.0],
        twoPhaseTransfers: false,
        onBudgetWarning,
      }),
    );

    await middleware.onSessionStart(createSessionContext());

    // Single turn that crosses all thresholds at once
    await middleware.onAfterTurn(createUsageTurn(1, 1000));

    expect(onBudgetWarning).toHaveBeenCalledTimes(4);
    expect(firedThresholds).toEqual([0.25, 0.5, 0.75, 1.0]);
  });

  describe("validatePayConfig — alertThresholds validation", () => {
    it("should accept valid alertThresholds array", () => {
      expect(() => validatePayConfig(createConfig({ alertThresholds: [0, 0.5, 1] }))).not.toThrow();
    });

    it("should accept alertThresholds as a single number", () => {
      expect(() => validatePayConfig(createConfig({ alertThresholds: 0.8 }))).not.toThrow();
    });

    it("should reject alertThresholds value below 0", () => {
      expect(() => validatePayConfig(createConfig({ alertThresholds: [-0.1, 0.5] }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ alertThresholds: [-0.1, 0.5] }))).toThrow(
        /alertThresholds values must be between 0 and 1/,
      );
    });

    it("should reject alertThresholds value above 1", () => {
      expect(() => validatePayConfig(createConfig({ alertThresholds: [0.5, 1.5] }))).toThrow(
        PayConfigurationError,
      );
      expect(() => validatePayConfig(createConfig({ alertThresholds: [0.5, 1.5] }))).toThrow(
        /alertThresholds values must be between 0 and 1/,
      );
    });
  });
});
