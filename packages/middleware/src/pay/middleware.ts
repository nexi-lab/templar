import type { NexusClient, TokenUsage } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { BudgetExhaustedError, PayConfigurationError } from "@templar/errors";
import { withTimeout } from "../utils.js";
import {
  type BudgetPressure,
  type CacheStats,
  type CostEntry,
  DEFAULT_PAY_CONFIG,
  type NexusPayConfig,
} from "./types.js";

/**
 * NexusPayMiddleware — budget tracking and cost alerts for agent sessions.
 *
 * Integrates with NexusPay (TigerBeetle credits) to:
 * - Check budget before every LLM call
 * - Reserve credits via two-phase transfers (reserve → commit/release)
 * - Track per-model costs and prompt cache hit rates
 * - Emit budget warnings and PSI-style pressure metrics
 * - Hard-stop agents when budget is exhausted (kill switch)
 *
 * Budget lifecycle:
 * 1. Session start → fetch balance from API
 * 2. Before each turn → check budget, reserve credits
 * 3. After each turn → commit actual cost, update tracking
 * 4. Session end → release outstanding reservations, reconcile
 */
export class NexusPayMiddleware implements TemplarMiddleware {
  readonly name = "nexus-pay";

  private readonly client: NexusClient;
  private readonly config: Required<
    Omit<NexusPayConfig, "costCalculator" | "onBudgetWarning" | "onBudgetExhausted">
  > & {
    costCalculator: NexusPayConfig["costCalculator"];
    onBudgetWarning: NexusPayConfig["onBudgetWarning"];
    onBudgetExhausted: NexusPayConfig["onBudgetExhausted"];
  };

  // Session state — reassigned (not mutated) on updates
  private turnCount = 0;
  private balance = 0;
  private sessionCost = 0;
  private activeTransferId: string | undefined = undefined;
  private warningEmitted = false;
  private perModelCosts: ReadonlyMap<string, CostEntry> = new Map();
  private cacheStats: Readonly<CacheStats> = {
    hits: 0,
    misses: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  constructor(client: NexusClient, config: NexusPayConfig) {
    this.client = client;
    this.config = {
      dailyBudget: config.dailyBudget,
      alertThreshold: config.alertThreshold ?? DEFAULT_PAY_CONFIG.alertThreshold,
      hardLimit: config.hardLimit ?? DEFAULT_PAY_CONFIG.hardLimit,
      costTracking: config.costTracking ?? DEFAULT_PAY_CONFIG.costTracking,
      twoPhaseTransfers: config.twoPhaseTransfers ?? DEFAULT_PAY_CONFIG.twoPhaseTransfers,
      balanceCheckInterval: config.balanceCheckInterval ?? DEFAULT_PAY_CONFIG.balanceCheckInterval,
      balanceCheckTimeoutMs:
        config.balanceCheckTimeoutMs ?? DEFAULT_PAY_CONFIG.balanceCheckTimeoutMs,
      transferTimeoutMs: config.transferTimeoutMs ?? DEFAULT_PAY_CONFIG.transferTimeoutMs,
      reconciliationTimeoutMs:
        config.reconciliationTimeoutMs ?? DEFAULT_PAY_CONFIG.reconciliationTimeoutMs,
      defaultEstimatedCost: config.defaultEstimatedCost ?? DEFAULT_PAY_CONFIG.defaultEstimatedCost,
      costCalculator: config.costCalculator,
      onBudgetWarning: config.onBudgetWarning,
      onBudgetExhausted: config.onBudgetExhausted,
    };
  }

  /**
   * Fetch balance and initialize session state.
   * On failure: hard limit → throw, soft limit → warn and use dailyBudget optimistically.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    this.resetSessionState();

    try {
      const result = await withTimeout(
        this.client.pay.getBalance(),
        this.config.balanceCheckTimeoutMs,
      );

      if (result !== undefined) {
        this.balance = result.balance;
      } else {
        this.handleBalanceCheckFailure(context.sessionId, "balance query timed out");
      }
    } catch (error) {
      this.handleBalanceCheckFailure(
        context.sessionId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check budget, reserve credits (two-phase), reconcile periodically.
   * Throws BudgetExhaustedError when hard limit is active and budget is depleted.
   */
  async onBeforeTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Check if budget is already exhausted
    if (this.isBudgetExhausted()) {
      if (this.config.hardLimit) {
        throw new BudgetExhaustedError(this.config.dailyBudget, this.sessionCost, this.balance);
      }
    }

    // Two-phase transfer: reserve estimated cost
    if (this.config.twoPhaseTransfers) {
      await this.reserveCredits(context.sessionId);
    } else {
      // Without two-phase: periodic balance reconciliation
      await this.maybeReconcileBalance(context.sessionId);
    }
  }

  /**
   * Commit actual cost, update tracking, emit warnings and PSI metrics.
   */
  async onAfterTurn(context: TurnContext): Promise<void> {
    const usage = this.extractUsage(context);
    const actualCost = this.calculateCost(usage);

    // Commit or debit the actual cost
    if (this.config.twoPhaseTransfers && this.activeTransferId !== undefined) {
      await this.commitTransfer(context.sessionId, actualCost);
    } else if (actualCost > 0) {
      await this.debitCost(context.sessionId, actualCost, usage?.model);
    }

    // Update local balance tracking
    this.sessionCost += actualCost;
    this.balance = Math.max(0, this.balance - actualCost);

    // Update per-model costs
    if (this.config.costTracking && usage !== undefined) {
      this.updateModelCosts(usage, actualCost);
      this.updateCacheStats(usage);
    }

    // Check and emit budget warning
    await this.checkBudgetThreshold(context.sessionId);

    // Inject PSI-style pressure metrics into metadata
    this.injectBudgetPressure(context);
  }

  /**
   * Release outstanding reservations and log session summary.
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    // Release any outstanding reservation
    if (this.activeTransferId !== undefined) {
      await this.releaseTransfer(context.sessionId);
    }

    // Final balance reconciliation
    try {
      const result = await withTimeout(
        this.client.pay.getBalance(),
        this.config.reconciliationTimeoutMs,
      );

      if (result !== undefined) {
        this.balance = result.balance;
      }
    } catch {
      // Best-effort reconciliation — don't fail session end
    }

    // Log session summary
    console.info(
      `[nexus-pay] Session ${context.sessionId}: completed. Cost: ${this.sessionCost} credits, ` +
        `turns: ${this.turnCount}, balance: ${this.balance}`,
    );
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private resetSessionState(): void {
    this.turnCount = 0;
    this.balance = 0;
    this.sessionCost = 0;
    this.activeTransferId = undefined;
    this.warningEmitted = false;
    this.perModelCosts = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  private handleBalanceCheckFailure(sessionId: string, reason: string): void {
    if (this.config.hardLimit) {
      throw new BudgetExhaustedError(this.config.dailyBudget, 0, 0, { session_id: sessionId });
    }
    // Soft limit: warn and continue with optimistic balance
    console.warn(
      `[nexus-pay] Session ${sessionId}: ${reason}, continuing with dailyBudget as balance`,
    );
    this.balance = this.config.dailyBudget;
  }

  private isBudgetExhausted(): boolean {
    return this.balance <= 0 || this.sessionCost >= this.config.dailyBudget;
  }

  /**
   * Reserve estimated credits before the LLM call.
   * Estimate = average cost per turn, or defaultEstimatedCost if no history.
   */
  private async reserveCredits(sessionId: string): Promise<void> {
    const estimatedCost = this.getEstimatedCost();

    try {
      const result = await withTimeout(
        this.client.pay.transfer({
          amount: estimatedCost,
          phase: "reserve",
          description: `Session ${sessionId} turn ${this.turnCount} estimate`,
        }),
        this.config.transferTimeoutMs,
      );

      if (result !== undefined) {
        this.activeTransferId = result.transfer_id;
        this.balance = result.balance;
      } else {
        this.handleReserveFailure(sessionId, "reserve timed out");
      }
    } catch (error) {
      this.handleReserveFailure(sessionId, error instanceof Error ? error.message : String(error));
    }
  }

  private handleReserveFailure(sessionId: string, reason: string): void {
    this.activeTransferId = undefined;

    if (this.config.hardLimit) {
      throw new BudgetExhaustedError(this.config.dailyBudget, this.sessionCost, this.balance, {
        session_id: sessionId,
      });
    }
    console.warn(`[nexus-pay] Session ${sessionId}: ${reason}, continuing without reservation`);
  }

  private getEstimatedCost(): number {
    if (this.turnCount <= 1 || this.sessionCost === 0) {
      return this.config.defaultEstimatedCost;
    }
    // Average cost per completed turn
    return Math.ceil(this.sessionCost / (this.turnCount - 1));
  }

  /**
   * Commit the actual cost for a completed turn.
   * On failure: attempt release and warn.
   */
  private async commitTransfer(sessionId: string, actualCost: number): Promise<void> {
    const transferId = this.activeTransferId;
    this.activeTransferId = undefined;

    if (transferId === undefined) {
      return;
    }

    try {
      const result = await withTimeout(
        this.client.pay.transfer({
          amount: actualCost,
          phase: "commit",
          transfer_id: transferId,
        }),
        this.config.transferTimeoutMs,
      );

      if (result !== undefined) {
        this.balance = result.balance;
      } else {
        // Commit timed out — attempt release as compensating action
        console.warn(
          `[nexus-pay] Session ${sessionId}: commit timed out for transfer ${transferId}, attempting release`,
        );
        await this.releaseTransferById(sessionId, transferId);
      }
    } catch (error) {
      // Commit failed — attempt release as compensating action
      console.warn(
        `[nexus-pay] Session ${sessionId}: commit failed for transfer ${transferId}: ${
          error instanceof Error ? error.message : String(error)
        }, attempting release`,
      );
      await this.releaseTransferById(sessionId, transferId);
    }
  }

  /**
   * Debit credits directly (single-phase, when two-phase is disabled).
   */
  private async debitCost(
    sessionId: string,
    amount: number,
    model: string | undefined,
  ): Promise<void> {
    try {
      const result = await withTimeout(
        this.client.pay.debit({
          amount,
          ...(model !== undefined ? { model } : {}),
          session_id: sessionId,
        }),
        this.config.transferTimeoutMs,
      );

      if (result !== undefined) {
        this.balance = result.balance;
      }
    } catch (error) {
      console.warn(
        `[nexus-pay] Session ${sessionId}: debit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Release the currently active transfer.
   */
  private async releaseTransfer(sessionId: string): Promise<void> {
    const transferId = this.activeTransferId;
    this.activeTransferId = undefined;

    if (transferId === undefined) {
      return;
    }

    await this.releaseTransferById(sessionId, transferId);
  }

  /**
   * Release a specific transfer by ID (best-effort).
   */
  private async releaseTransferById(sessionId: string, transferId: string): Promise<void> {
    try {
      await withTimeout(
        this.client.pay.transfer({
          amount: 0,
          phase: "release",
          transfer_id: transferId,
        }),
        this.config.transferTimeoutMs,
      );
    } catch (error) {
      console.warn(
        `[nexus-pay] Session ${sessionId}: release failed for transfer ${transferId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Periodically re-check balance via API (hybrid approach).
   * Also checks when approaching the alert threshold for accuracy.
   */
  private async maybeReconcileBalance(sessionId: string): Promise<void> {
    const pressure = this.config.dailyBudget > 0 ? this.sessionCost / this.config.dailyBudget : 0;

    const isReconciliationTurn = this.turnCount % this.config.balanceCheckInterval === 0;
    const isApproachingThreshold = pressure >= this.config.alertThreshold * 0.9;

    if (!isReconciliationTurn && !isApproachingThreshold) {
      return;
    }

    try {
      const result = await withTimeout(
        this.client.pay.getBalance(),
        this.config.reconciliationTimeoutMs,
      );

      if (result !== undefined) {
        this.balance = result.balance;
      }
    } catch {
      console.warn(
        `[nexus-pay] Session ${sessionId}: reconciliation failed, continuing with local balance`,
      );
    }
  }

  /**
   * Extract TokenUsage from turn context metadata (convention-based).
   */
  private extractUsage(context: TurnContext): TokenUsage | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    const usage = metadata.usage;
    if (usage === undefined || typeof usage !== "object" || usage === null) {
      return undefined;
    }

    const record = usage as Record<string, unknown>;
    if (typeof record.model !== "string" || typeof record.inputTokens !== "number") {
      return undefined;
    }

    return usage as TokenUsage;
  }

  /**
   * Calculate actual cost from token usage.
   * Priority: costCalculator callback > usage.totalCost > defaultEstimatedCost.
   */
  private calculateCost(usage: TokenUsage | undefined): number {
    if (usage !== undefined && this.config.costCalculator !== undefined) {
      return this.config.costCalculator(usage.model, usage);
    }

    if (usage?.totalCost !== undefined) {
      return usage.totalCost;
    }

    return this.config.defaultEstimatedCost;
  }

  /**
   * Update per-model cost tracking (bounded by unique model count).
   */
  private updateModelCosts(usage: TokenUsage, cost: number): void {
    const existing = this.perModelCosts.get(usage.model);
    const updated: CostEntry = {
      totalCost: (existing?.totalCost ?? 0) + cost,
      totalTokens: (existing?.totalTokens ?? 0) + usage.totalTokens,
      requestCount: (existing?.requestCount ?? 0) + 1,
    };

    const newMap = new Map(this.perModelCosts);
    newMap.set(usage.model, updated);
    this.perModelCosts = newMap;
  }

  /**
   * Update prompt cache statistics.
   */
  private updateCacheStats(usage: TokenUsage): void {
    const hasCacheHit = usage.cacheReadTokens !== undefined && usage.cacheReadTokens > 0;

    this.cacheStats = {
      hits: this.cacheStats.hits + (hasCacheHit ? 1 : 0),
      misses: this.cacheStats.misses + (hasCacheHit ? 0 : 1),
      cacheReadTokens: this.cacheStats.cacheReadTokens + (usage.cacheReadTokens ?? 0),
      cacheCreationTokens: this.cacheStats.cacheCreationTokens + (usage.cacheCreationTokens ?? 0),
    };
  }

  /**
   * Check if budget threshold has been crossed and emit warning.
   */
  private async checkBudgetThreshold(sessionId: string): Promise<void> {
    if (this.warningEmitted || this.config.dailyBudget <= 0) {
      return;
    }

    const pressure = this.sessionCost / this.config.dailyBudget;

    if (pressure >= this.config.alertThreshold) {
      this.warningEmitted = true;

      if (this.config.onBudgetWarning !== undefined) {
        try {
          await this.config.onBudgetWarning({
            sessionId,
            budget: this.config.dailyBudget,
            spent: this.sessionCost,
            remaining: this.balance,
            pressure,
            threshold: this.config.alertThreshold,
          });
        } catch (error) {
          console.warn(
            `[nexus-pay] Session ${sessionId}: onBudgetWarning callback failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    // Check if fully exhausted
    if (this.isBudgetExhausted() && this.config.onBudgetExhausted !== undefined) {
      try {
        await this.config.onBudgetExhausted({
          sessionId,
          budget: this.config.dailyBudget,
          spent: this.sessionCost,
        });
      } catch (error) {
        console.warn(
          `[nexus-pay] Session ${sessionId}: onBudgetExhausted callback failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Inject PSI-style budget pressure metrics into turn context metadata.
   */
  private injectBudgetPressure(context: TurnContext): void {
    const totalCacheRequests = this.cacheStats.hits + this.cacheStats.misses;

    const pressure: BudgetPressure = {
      remaining: this.balance,
      dailyBudget: this.config.dailyBudget,
      pressure: this.config.dailyBudget > 0 ? this.sessionCost / this.config.dailyBudget : 0,
      sessionCost: this.sessionCost,
      cacheHitRate: totalCacheRequests > 0 ? this.cacheStats.hits / totalCacheRequests : 0,
    };

    const metadata = context.metadata ?? {};
    context.metadata = {
      ...metadata,
      budget: pressure,
    };
  }
}

/**
 * Validate NexusPayConfig.
 * @throws {PayConfigurationError} if config is invalid
 */
export function validatePayConfig(config: NexusPayConfig): void {
  if (config.dailyBudget < 0) {
    throw new PayConfigurationError(`dailyBudget must be >= 0, got ${config.dailyBudget}`);
  }

  if (
    config.alertThreshold !== undefined &&
    (config.alertThreshold < 0 || config.alertThreshold > 1)
  ) {
    throw new PayConfigurationError(
      `alertThreshold must be between 0 and 1, got ${config.alertThreshold}`,
    );
  }

  if (config.balanceCheckInterval !== undefined && config.balanceCheckInterval < 1) {
    throw new PayConfigurationError(
      `balanceCheckInterval must be >= 1, got ${config.balanceCheckInterval}`,
    );
  }

  if (config.balanceCheckTimeoutMs !== undefined && config.balanceCheckTimeoutMs < 0) {
    throw new PayConfigurationError(
      `balanceCheckTimeoutMs must be >= 0, got ${config.balanceCheckTimeoutMs}`,
    );
  }

  if (config.transferTimeoutMs !== undefined && config.transferTimeoutMs < 0) {
    throw new PayConfigurationError(
      `transferTimeoutMs must be >= 0, got ${config.transferTimeoutMs}`,
    );
  }

  if (config.reconciliationTimeoutMs !== undefined && config.reconciliationTimeoutMs < 0) {
    throw new PayConfigurationError(
      `reconciliationTimeoutMs must be >= 0, got ${config.reconciliationTimeoutMs}`,
    );
  }

  if (config.defaultEstimatedCost !== undefined && config.defaultEstimatedCost < 0) {
    throw new PayConfigurationError(
      `defaultEstimatedCost must be >= 0, got ${config.defaultEstimatedCost}`,
    );
  }
}
