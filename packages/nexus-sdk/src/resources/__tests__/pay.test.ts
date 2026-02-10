import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import type { BalanceResponse, DebitResponse, TransferResponse } from "../../types/pay.js";

describe("PayResource", () => {
  let originalFetch: typeof global.fetch;
  let client: NexusClient;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new NexusClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(data: unknown, status = 200): void {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  function mockFetchError(errorBody: unknown, status: number): void {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(errorBody), { status }));
  }

  // =========================================================================
  // getBalance()
  // =========================================================================

  describe("getBalance", () => {
    const mockResponse: BalanceResponse = {
      balance: 1000,
      currency: "credits",
      updated_at: "2024-01-15T12:00:00Z",
    };

    it("should get the current balance", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.pay.getBalance();

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/balance",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should return balance with correct types", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.pay.getBalance();

      expect(typeof result.balance).toBe("number");
      expect(typeof result.currency).toBe("string");
      expect(typeof result.updated_at).toBe("string");
    });

    it("should handle zero balance", async () => {
      mockFetchResponse({ ...mockResponse, balance: 0 });

      const result = await client.pay.getBalance();

      expect(result.balance).toBe(0);
    });

    it("should propagate API errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Balance query failed" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(singleRetryClient.pay.getBalance()).rejects.toThrow();
    });
  });

  // =========================================================================
  // transfer() — reserve phase
  // =========================================================================

  describe("transfer - reserve phase", () => {
    const mockResponse: TransferResponse = {
      transfer_id: "txn-123",
      phase: "reserve",
      amount: 100,
      balance: 900,
      status: "reserved",
    };

    it("should reserve credits with minimal params", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 100,
        phase: "reserve",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            phase: "reserve",
          }),
        }),
      );
    });

    it("should reserve credits with description", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.transfer({
        amount: 100,
        phase: "reserve",
        description: "GPT-4o call estimate",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 100,
            phase: "reserve",
            description: "GPT-4o call estimate",
          }),
        }),
      );
    });

    it("should reserve credits with metadata", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.transfer({
        amount: 100,
        phase: "reserve",
        metadata: { session_id: "sess-456", model: "gpt-4o" },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 100,
            phase: "reserve",
            metadata: { session_id: "sess-456", model: "gpt-4o" },
          }),
        }),
      );
    });

    it("should reserve credits with all optional params", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.transfer({
        amount: 100,
        phase: "reserve",
        description: "LLM call reservation",
        metadata: { request_id: "req-789" },
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    it("should return transfer_id for future commit/release", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 100,
        phase: "reserve",
      });

      expect(result.transfer_id).toBe("txn-123");
      expect(result.status).toBe("reserved");
    });
  });

  // =========================================================================
  // transfer() — commit phase
  // =========================================================================

  describe("transfer - commit phase", () => {
    const mockResponse: TransferResponse = {
      transfer_id: "txn-123",
      phase: "commit",
      amount: 75,
      balance: 925,
      status: "committed",
    };

    it("should commit transfer with transfer_id", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 75,
        phase: "commit",
        transfer_id: "txn-123",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 75,
            phase: "commit",
            transfer_id: "txn-123",
          }),
        }),
      );
    });

    it("should commit with updated balance", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 75,
        phase: "commit",
        transfer_id: "txn-123",
      });

      expect(result.balance).toBe(925);
      expect(result.status).toBe("committed");
    });

    it("should commit with description and metadata", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.transfer({
        amount: 75,
        phase: "commit",
        transfer_id: "txn-123",
        description: "Actual usage: 75 credits",
        metadata: { actual_tokens: 7500 },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 75,
            phase: "commit",
            transfer_id: "txn-123",
            description: "Actual usage: 75 credits",
            metadata: { actual_tokens: 7500 },
          }),
        }),
      );
    });
  });

  // =========================================================================
  // transfer() — release phase
  // =========================================================================

  describe("transfer - release phase", () => {
    const mockResponse: TransferResponse = {
      transfer_id: "txn-123",
      phase: "release",
      amount: 100,
      balance: 1000,
      status: "released",
    };

    it("should release reserved credits", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 100,
        phase: "release",
        transfer_id: "txn-123",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/transfer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 100,
            phase: "release",
            transfer_id: "txn-123",
          }),
        }),
      );
    });

    it("should restore original balance on release", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.transfer({
        amount: 100,
        phase: "release",
        transfer_id: "txn-123",
      });

      expect(result.balance).toBe(1000);
      expect(result.status).toBe("released");
    });

    it("should release with description", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.transfer({
        amount: 100,
        phase: "release",
        transfer_id: "txn-123",
        description: "LLM call failed, releasing reservation",
      });

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // transfer() — error cases
  // =========================================================================

  describe("transfer - error handling", () => {
    it("should handle insufficient balance error", async () => {
      mockFetchError({ code: "INSUFFICIENT_BALANCE", message: "Balance too low" }, 400);

      await expect(
        client.pay.transfer({
          amount: 10000,
          phase: "reserve",
        }),
      ).rejects.toThrow("Balance too low");
    });

    it("should handle invalid transfer_id error", async () => {
      mockFetchError({ code: "INVALID_TRANSFER", message: "Transfer not found: txn-999" }, 404);

      await expect(
        client.pay.transfer({
          amount: 100,
          phase: "commit",
          transfer_id: "txn-999",
        }),
      ).rejects.toThrow("Transfer not found");
    });

    it("should handle missing transfer_id for commit", async () => {
      mockFetchError({ code: "VALIDATION_ERROR", message: "transfer_id required for commit" }, 400);

      await expect(
        client.pay.transfer({
          amount: 100,
          phase: "commit",
        }),
      ).rejects.toThrow("transfer_id required");
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        client.pay.transfer({
          amount: 100,
          phase: "reserve",
        }),
      ).rejects.toThrow("Network error");
    });
  });

  // =========================================================================
  // debit()
  // =========================================================================

  describe("debit", () => {
    const mockResponse: DebitResponse = {
      debit_id: "dbt-456",
      amount: 75,
      balance: 925,
    };

    it("should debit credits with minimal params", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.debit({
        amount: 75,
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/debit",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 75,
          }),
        }),
      );
    });

    it("should debit with model attribution", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.debit({
        amount: 75,
        model: "gpt-4o",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/debit",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 75,
            model: "gpt-4o",
          }),
        }),
      );
    });

    it("should debit with session_id", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.debit({
        amount: 75,
        session_id: "sess-789",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/debit",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 75,
            session_id: "sess-789",
          }),
        }),
      );
    });

    it("should debit with metadata", async () => {
      mockFetchResponse(mockResponse, 200);

      await client.pay.debit({
        amount: 75,
        metadata: {
          request_id: "req-001",
          user_id: "user-456",
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/pay/debit",
        expect.objectContaining({
          body: JSON.stringify({
            amount: 75,
            metadata: {
              request_id: "req-001",
              user_id: "user-456",
            },
          }),
        }),
      );
    });

    it("should debit with all optional fields", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.debit({
        amount: 75,
        model: "gpt-4o",
        session_id: "sess-789",
        metadata: {
          input_tokens: 5000,
          output_tokens: 2500,
          total_tokens: 7500,
        },
      });

      expect(result.debit_id).toBe("dbt-456");
      expect(result.amount).toBe(75);
      expect(result.balance).toBe(925);
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should return updated balance after debit", async () => {
      mockFetchResponse(mockResponse, 200);

      const result = await client.pay.debit({
        amount: 75,
      });

      expect(result.balance).toBe(925);
      expect(typeof result.debit_id).toBe("string");
    });
  });

  // =========================================================================
  // debit() — error cases
  // =========================================================================

  describe("debit - error handling", () => {
    it("should handle insufficient balance error", async () => {
      mockFetchError({ code: "INSUFFICIENT_BALANCE", message: "Balance too low" }, 400);

      await expect(
        client.pay.debit({
          amount: 10000,
        }),
      ).rejects.toThrow("Balance too low");
    });

    it("should handle invalid amount error", async () => {
      mockFetchError({ code: "VALIDATION_ERROR", message: "Amount must be positive" }, 400);

      await expect(
        client.pay.debit({
          amount: -10,
        }),
      ).rejects.toThrow("Amount must be positive");
    });

    it("should handle server errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Debit processing failed" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(
        singleRetryClient.pay.debit({
          amount: 75,
        }),
      ).rejects.toThrow("Debit processing failed");
    });
  });

  // =========================================================================
  // Error handling (cross-cutting)
  // =========================================================================

  describe("error handling", () => {
    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(client.pay.getBalance()).rejects.toThrow("Network error");
    });

    it("should handle timeout errors", async () => {
      const timeoutClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        timeout: 10,
        retry: { maxAttempts: 1 },
      });

      global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        // Simulate a slow response that will be aborted
        return new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
        });
      });

      await expect(timeoutClient.pay.getBalance()).rejects.toThrow();
    });

    it("should handle 401 unauthorized", async () => {
      mockFetchError({ code: "UNAUTHORIZED", message: "Invalid API key" }, 401);

      await expect(client.pay.getBalance()).rejects.toThrow("Invalid API key");
    });

    it("should handle 500 server errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Server error" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(singleRetryClient.pay.getBalance()).rejects.toThrow("Server error");
    });

    it("should handle 503 service unavailable", async () => {
      mockFetchError({ code: "SERVICE_UNAVAILABLE", message: "Service temporarily down" }, 503);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(
        singleRetryClient.pay.transfer({
          amount: 100,
          phase: "reserve",
        }),
      ).rejects.toThrow("Service temporarily down");
    });
  });

  // =========================================================================
  // Integration scenarios (multi-step workflows)
  // =========================================================================

  describe("integration scenarios", () => {
    it("should handle full reserve-commit workflow", async () => {
      // Step 1: Reserve credits
      const reserveResponse: TransferResponse = {
        transfer_id: "txn-123",
        phase: "reserve",
        amount: 100,
        balance: 900,
        status: "reserved",
      };
      mockFetchResponse(reserveResponse);

      const reservation = await client.pay.transfer({
        amount: 100,
        phase: "reserve",
      });

      expect(reservation.transfer_id).toBe("txn-123");
      expect(reservation.balance).toBe(900);

      // Step 2: Commit actual usage
      const commitResponse: TransferResponse = {
        transfer_id: "txn-123",
        phase: "commit",
        amount: 75,
        balance: 925,
        status: "committed",
      };
      mockFetchResponse(commitResponse);

      const commit = await client.pay.transfer({
        amount: 75,
        phase: "commit",
        transfer_id: reservation.transfer_id,
      });

      expect(commit.status).toBe("committed");
      expect(commit.balance).toBe(925);
    });

    it("should handle full reserve-release workflow", async () => {
      // Step 1: Reserve credits
      const reserveResponse: TransferResponse = {
        transfer_id: "txn-456",
        phase: "reserve",
        amount: 100,
        balance: 900,
        status: "reserved",
      };
      mockFetchResponse(reserveResponse);

      const reservation = await client.pay.transfer({
        amount: 100,
        phase: "reserve",
      });

      expect(reservation.transfer_id).toBe("txn-456");

      // Step 2: Release on failure
      const releaseResponse: TransferResponse = {
        transfer_id: "txn-456",
        phase: "release",
        amount: 100,
        balance: 1000,
        status: "released",
      };
      mockFetchResponse(releaseResponse);

      const release = await client.pay.transfer({
        amount: 100,
        phase: "release",
        transfer_id: reservation.transfer_id,
      });

      expect(release.status).toBe("released");
      expect(release.balance).toBe(1000);
    });

    it("should handle balance check before large debit", async () => {
      // Step 1: Check balance
      const balanceResponse: BalanceResponse = {
        balance: 1000,
        currency: "credits",
        updated_at: "2024-01-15T12:00:00Z",
      };
      mockFetchResponse(balanceResponse);

      const balance = await client.pay.getBalance();
      expect(balance.balance).toBeGreaterThanOrEqual(500);

      // Step 2: Debit if sufficient
      const debitResponse: DebitResponse = {
        debit_id: "dbt-789",
        amount: 500,
        balance: 500,
      };
      mockFetchResponse(debitResponse);

      const debit = await client.pay.debit({ amount: 500 });
      expect(debit.balance).toBe(500);
    });
  });
});
