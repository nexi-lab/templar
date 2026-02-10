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

describe("NexusPayMiddleware - Two-Phase Transfer State Machine", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  describe("Happy path: reserve → commit", () => {
    it("should complete full turn lifecycle with two-phase transfers", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 985,
          amount: 15,
          status: "committed",
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

    it("should use average cost for second turn estimation", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 990,
        amount: 20,
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

      // Turn 1: reserve defaultEstimatedCost
      await middleware.onBeforeTurn(createTurnContext(1));

      expect(mockClient.mockPay.transfer).toHaveBeenLastCalledWith({
        amount: 10,
        phase: "reserve",
        description: expect.stringContaining("turn 1 estimate"),
      });

      // Complete turn 1 with actual cost 20
      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t1",
        balance: 980,
        amount: 20,
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
              totalCost: 20,
            },
          },
        }),
      );

      // Turn 2: should reserve average cost (20 / 1 = 20)
      mockClient.mockPay.transfer.mockResolvedValue({
        transfer_id: "t2",
        balance: 960,
        amount: 20,
        status: "reserved",
        created_at: "2026-02-10T12:00:00Z",
      });

      await middleware.onBeforeTurn(createTurnContext(2));

      expect(mockClient.mockPay.transfer).toHaveBeenLastCalledWith({
        amount: 20,
        phase: "reserve",
        description: expect.stringContaining("turn 2 estimate"),
      });
    });
  });

  describe("LLM failure pattern: reserve succeeded but no usage", () => {
    it("should commit defaultEstimatedCost when no usage metadata", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "committed",
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

      // No usage metadata in turn context (LLM error)
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockPay.transfer).toHaveBeenLastCalledWith({
        amount: 10,
        phase: "commit",
        transfer_id: "t1",
      });
    });

    it("should commit defaultEstimatedCost when usage has no totalCost and no costCalculator", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "committed",
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

      // Usage without totalCost
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

      expect(mockClient.mockPay.transfer).toHaveBeenLastCalledWith({
        amount: 10,
        phase: "commit",
        transfer_id: "t1",
      });
    });
  });

  describe("Reserve failure with hardLimit", () => {
    it("should throw BudgetExhaustedError on reserve failure with hardLimit=true", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockRejectedValue(new Error("Insufficient balance"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          hardLimit: true,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should clear activeTransferId on reserve failure", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockRejectedValue(new Error("API error"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          hardLimit: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      // onAfterTurn should not attempt commit (no active transfer)
      mockClient.mockPay.transfer.mockClear();
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockPay.transfer).not.toHaveBeenCalled();
    });
  });

  describe("Reserve failure without hardLimit", () => {
    it("should warn and continue on reserve failure with hardLimit=false", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockRejectedValue(new Error("Network timeout"));

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          hardLimit: false,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
      expect(warnMessage).toContain("Network timeout");
      expect(warnMessage).toContain("continuing without reservation");
    });
  });

  describe("Reserve timeout", () => {
    it("should handle reserve timeout with hardLimit=true", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          hardLimit: true,
          transferTimeoutMs: 100,
        }),
      );

      await middleware.onSessionStart(createSessionContext());

      await expect(middleware.onBeforeTurn(createTurnContext(1))).rejects.toThrow(
        BudgetExhaustedError,
      );
    });

    it("should handle reserve timeout with hardLimit=false", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          hardLimit: false,
          transferTimeoutMs: 100,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
      expect(warnMessage).toContain("reserve timed out");
      expect(warnMessage).toContain("continuing without reservation");
    });
  });

  describe("Commit failure", () => {
    it("should attempt release as compensating action on commit failure", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        .mockRejectedValueOnce(new Error("Commit failed"))
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 1000,
          amount: 0,
          status: "released",
          created_at: "2026-02-10T12:00:00Z",
        });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ twoPhaseTransfers: true }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

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
        amount: 0,
        phase: "release",
        transfer_id: "t1",
      });

      const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
      expect(warnMessage).toContain("commit failed for transfer t1");
      expect(warnMessage).toContain("attempting release");
    });
  });

  describe("Commit timeout", () => {
    it("should attempt release on commit timeout", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      let callCount = 0;
      mockClient.mockPay.transfer.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Reserve succeeds
          return Promise.resolve({
            transfer_id: "t1",
            balance: 990,
            amount: 10,
            status: "reserved",
            created_at: "2026-02-10T12:00:00Z",
          });
        }
        if (callCount === 2) {
          // Commit times out
          return new Promise(() => {});
        }
        // Release succeeds
        return Promise.resolve({
          transfer_id: "t1",
          balance: 1000,
          amount: 0,
          status: "released",
          created_at: "2026-02-10T12:00:00Z",
        });
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: true,
          transferTimeoutMs: 100,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

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

      const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
      expect(warnMessage).toContain("commit timed out for transfer t1");
      expect(warnMessage).toContain("attempting release");

      expect(mockClient.mockPay.transfer).toHaveBeenCalledWith({
        amount: 0,
        phase: "release",
        transfer_id: "t1",
      });
    });
  });

  describe("Multiple turns: correct transferId management", () => {
    it("should manage different transfer IDs across multiple turns", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.transfer
        // Turn 1 reserve
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 990,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        // Turn 1 commit
        .mockResolvedValueOnce({
          transfer_id: "t1",
          balance: 985,
          amount: 15,
          status: "committed",
          created_at: "2026-02-10T12:00:00Z",
        })
        // Turn 2 reserve
        .mockResolvedValueOnce({
          transfer_id: "t2",
          balance: 975,
          amount: 10,
          status: "reserved",
          created_at: "2026-02-10T12:00:00Z",
        })
        // Turn 2 commit
        .mockResolvedValueOnce({
          transfer_id: "t2",
          balance: 965,
          amount: 20,
          status: "committed",
          created_at: "2026-02-10T12:00:00Z",
        });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ twoPhaseTransfers: true }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Turn 1
      await middleware.onBeforeTurn(createTurnContext(1));
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

      // Turn 2
      await middleware.onBeforeTurn(createTurnContext(2));
      await middleware.onAfterTurn(
        createTurnContext(2, {
          metadata: {
            usage: {
              model: "claude-opus-4",
              inputTokens: 150,
              outputTokens: 100,
              totalTokens: 250,
              totalCost: 20,
            },
          },
        }),
      );

      const calls = mockClient.mockPay.transfer.mock.calls;

      // Verify correct transfer IDs
      expect(calls[0]?.[0]).toMatchObject({ phase: "reserve" });
      expect(calls[1]?.[0]).toMatchObject({ phase: "commit", transfer_id: "t1" });
      expect(calls[2]?.[0]).toMatchObject({ phase: "reserve" });
      expect(calls[3]?.[0]).toMatchObject({ phase: "commit", transfer_id: "t2" });
    });

    it("should not commit if there is no active transfer", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({ twoPhaseTransfers: true }),
      );

      await middleware.onSessionStart(createSessionContext());

      // Call onAfterTurn without calling onBeforeTurn first
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

      expect(mockClient.mockPay.transfer).not.toHaveBeenCalled();
    });
  });

  describe("No two-phase (twoPhaseTransfers: false): uses debit", () => {
    it("should use debit instead of two-phase transfers", async () => {
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
        createConfig({ twoPhaseTransfers: false }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      expect(mockClient.mockPay.transfer).not.toHaveBeenCalled();

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

      expect(mockClient.mockPay.debit).toHaveBeenCalledWith({
        amount: 15,
        model: "claude-opus-4",
        session_id: "test-session-1",
      });
    });

    it("should not call debit when cost is 0", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          defaultEstimatedCost: 0,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));
      await middleware.onAfterTurn(createTurnContext(1));

      expect(mockClient.mockPay.debit).not.toHaveBeenCalled();
    });
  });

  describe("Debit failure", () => {
    it("should warn but not throw on debit failure", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.debit.mockRejectedValue(new Error("Debit failed"));

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
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              totalCost: 15,
            },
          },
        }),
      );

      const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
      expect(warnMessage).toContain("debit failed");
      expect(warnMessage).toContain("Debit failed");
    });

    it("should not throw on debit timeout", async () => {
      mockClient.mockPay.getBalance.mockResolvedValue({
        balance: 1000,
        currency: "credits",
        updated_at: "2026-02-10T12:00:00Z",
      });

      mockClient.mockPay.debit.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const middleware = new NexusPayMiddleware(
        mockClient.client,
        createConfig({
          twoPhaseTransfers: false,
          transferTimeoutMs: 100,
        }),
      );

      await middleware.onSessionStart(createSessionContext());
      await middleware.onBeforeTurn(createTurnContext(1));

      await expect(
        middleware.onAfterTurn(
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
        ),
      ).resolves.toBeUndefined();

      // Debit timeout results in undefined (no warning logged, unlike reserve/commit)
      // This is graceful degradation - local balance tracking continues
    });
  });
});
