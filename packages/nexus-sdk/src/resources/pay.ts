/**
 * Pay resource for budget tracking and cost management
 */

import type {
  BalanceResponse,
  DebitParams,
  DebitResponse,
  TransferParams,
  TransferResponse,
} from "../types/pay.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing credits via the NexusPay API (v2)
 *
 * Supports:
 * - Balance queries
 * - Two-phase credit transfers (reserve → commit/release)
 * - Direct debit for completed usage
 */
export class PayResource extends BaseResource {
  /**
   * Get the agent wallet balance
   *
   * @returns Current credit balance and metadata
   *
   * @example
   * ```typescript
   * const { balance, currency } = await client.pay.getBalance();
   * console.log(`Balance: ${balance} ${currency}`);
   * ```
   */
  async getBalance(): Promise<BalanceResponse> {
    return this.http.request<BalanceResponse>("/api/v2/pay/balance", {
      method: "GET",
    });
  }

  /**
   * Execute a credit transfer (two-phase commit)
   *
   * Phases:
   * - "reserve": Hold credits before an LLM call. Returns a transfer_id.
   * - "commit": Finalize the transfer with actual cost. Requires transfer_id.
   * - "release": Cancel the reservation. Requires transfer_id.
   *
   * @param params - Transfer parameters including phase and amount
   * @returns Transfer result with updated balance
   *
   * @example
   * ```typescript
   * // Phase 1: Reserve credits
   * const reservation = await client.pay.transfer({
   *   amount: 100,
   *   phase: "reserve",
   *   description: "GPT-4o call estimate",
   * });
   *
   * // Phase 2a: Commit actual cost
   * await client.pay.transfer({
   *   amount: 75,
   *   phase: "commit",
   *   transfer_id: reservation.transfer_id,
   * });
   *
   * // Phase 2b: Release on failure
   * await client.pay.transfer({
   *   amount: 100,
   *   phase: "release",
   *   transfer_id: reservation.transfer_id,
   * });
   * ```
   */
  async transfer(params: TransferParams): Promise<TransferResponse> {
    return this.http.request<TransferResponse>("/api/v2/pay/transfer", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Debit credits for completed usage (single-phase)
   *
   * Use when two-phase transfers are disabled.
   *
   * @param params - Debit parameters including amount and attribution
   * @returns Debit result with updated balance
   *
   * @example
   * ```typescript
   * const result = await client.pay.debit({
   *   amount: 75,
   *   model: "gpt-4o",
   *   session_id: "session-123",
   * });
   * console.log(`Remaining: ${result.balance}`);
   * ```
   */
  async debit(params: DebitParams): Promise<DebitResponse> {
    return this.http.request<DebitResponse>("/api/v2/pay/debit", {
      method: "POST",
      body: params,
    });
  }
}
