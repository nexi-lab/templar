import type { NexusClient } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TokenUsage, TurnContext } from "@templar/core";
import { isTokenUsage } from "@templar/core";
import { BudgetExhaustedError, PayConfigurationError } from "@templar/errors";
import { withTimeout } from "../utils.js";
import {
  type BudgetPressure,
  type CacheStats,
  type CostReport,
  DEFAULT_PAY_CONFIG,
  type ModelCostEntry,
  type NexusPayConfig,
} from "./types.js";

/**
 * Resolve alertThresholds from config — supports backwards-compat single number.
 * Priority: alertThresholds > alertThreshold > default.
 */
function resolveAlertThresholds(config: NexusPayConfig): readonly number[] {
  if (config.alertThresholds !== undefined) {
    return typeof config.alertThresholds === "number"
      ? [config.alertThresholds]
      : config.alertThresholds;
  }
  if (config.alertThreshold !== undefined) {
    return [config.alertThreshold];
  }
  return DEFAULT_PAY_CONFIG.alertThresholds;
}

/**
 * NexusPayMiddleware — budget tracking, cost attribution, and alerts for agent sessions.
 *
 * Integrates with NexusPay (TigerBeetle credits) to:
 * - Check budget before every LLM call
 * - Reserve credits via two-phase transfers (reserve → commit/release)
 * - Track per-model costs and prompt cache hit rates
 * - Emit budget warnings at configurable thresholds (50%, 80%, 100%)
 * - Expose per-session cost reports via getCostReport()
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
  private readonly dailyBudget: number;
  private readonly alertThresholds: readonly number[];
  private readonly hardLimit: boolean;
  private readonly costTracking: boolean;
  private readonly twoPhaseTransfers: boolean;
  private readonly balanceCheckInterval: number;
  private readonly balanceCheckTimeoutMs: number;
  private readonly transferTimeoutMs: number;
  private readonly reconciliationTimeoutMs: number;
  private readonly defaultEstimatedCost: number;
  private readonly costCalculator: NexusPayConfig["costCalculator"];
  private readonly onBudgetWarningCb: NexusPayConfig["onBudgetWarning"];
  private readonly onBudgetExhaustedCb: NexusPayConfig["onBudgetExhausted"];

  // Session state — reassigned (not mutated) on updates
  private turnCount = 0;
  private balance = 0;
  private sessionCost = 0;
  private activeTransferId: string | undefined = undefined;
  private firedThresholds: ReadonlySet<number> = new Set();
  private perModelCosts: ReadonlyMap<string, ModelCostEntry> = new Map();
  private cacheStats: Readonly<CacheStats> = {
    hits: 0,
    misses: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  constructor(client: NexusClient, config: NexusPayConfig) {
    this.client = client;
    this.dailyBudget = config.dailyBudget;
    this.alertThresholds = resolveAlertThresholds(config);
    this.hardLimit = config.hardLimit ?? DEFAULT_PAY_CONFIG.hardLimit;
    this.costTracking = config.costTracking ?? DEFAULT_PAY_CONFIG.costTracking;
    this.twoPhaseTransfers = config.twoPhaseTransfers ?? DEFAULT_PAY_CONFIG.twoPhaseTransfers;
    this.balanceCheckInterval =
      config.balanceCheckInterval ?? DEFAULT_PAY_CONFIG.balanceCheckInterval;
    this.balanceCheckTimeoutMs =
      config.balanceCheckTimeoutMs ?? DEFAULT_PAY_CONFIG.balanceCheckTimeoutMs;
    this.transferTimeoutMs = config.transferTimeoutMs ?? DEFAULT_PAY_CONFIG.transferTimeoutMs;
    this.reconciliationTimeoutMs =
      config.reconciliationTimeoutMs ?? DEFAULT_PAY_CONFIG.reconciliationTimeoutMs;
    this.defaultEstimatedCost =
      config.defaultEstimatedCost ?? DEFAULT_PAY_CONFIG.defaultEstimatedCost;
    this.costCalculator = config.costCalculator;
    this.onBudgetWarningCb = config.onBudgetWarning;
    this.onBudgetExhaustedCb = config.onBudgetExhausted;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get a snapshot cost report for the current session.
   *
   * O(n) where n = number of unique models (typically 1-5).
   * Safe to call during or after a session.
   */
  getCostReport(sessionId: string): CostReport {
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;

    for (const entry of this.perModelCosts.values()) {
      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalTokens += entry.totalTokens;
    }

    return {
      sessionId,
      totalCost: this.sessionCost,
      totalTokens: {
        input: totalInput,
        output: totalOutput,
        total: totalTokens,
      },
      breakdown: {
        byModel: this.perModelCosts,
      },
      cache: { ...this.cacheStats },
      budget: {
        used: this.sessionCost,
        limit: this.dailyBudget,
        remaining: this.balance,
        pressure: this.dailyBudget > 0 ? this.sessionCost / this.dailyBudget : 0,
      },
      turnCount: this.turnCount,
      generatedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // LIFECYCLE HOOKS
  // ===========================================================================

  /**
   * Fetch balance and initialize session state.
   * On failure: hard limit → throw, soft limit → warn and use dailyBudget optimistically.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    this.resetSessionState();

    try {
      const result = await withTimeout(this.client.pay.getBalance(), this.balanceCheckTimeoutMs);

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
      if (this.hardLimit) {
        throw new BudgetExhaustedError(this.dailyBudget, this.sessionCost, this.balance);
      }
    }

    // Two-phase transfer: reserve estimated cost
    if (this.twoPhaseTransfers) {
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
    if (this.twoPhaseTransfers && this.activeTransferId !== undefined) {
      await this.commitTransfer(context.sessionId, actualCost);
    } else if (actualCost > 0) {
      await this.debitCost(context.sessionId, actualCost, usage?.model);
    }

    // Update local balance tracking
    this.sessionCost += actualCost;
    this.balance = Math.max(0, this.balance - actualCost);

    // Update per-model costs
    if (this.costTracking && usage !== undefined) {
      this.updateModelCosts(usage, actualCost);
      this.updateCacheStats(usage);
    }

    // Check and emit budget warnings
    await this.checkBudgetThresholds(context.sessionId);

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
      const result = await withTimeout(this.client.pay.getBalance(), this.reconciliationTimeoutMs);

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
    this.firedThresholds = new Set();
    this.perModelCosts = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  private handleBalanceCheckFailure(sessionId: string, reason: string): void {
    if (this.hardLimit) {
      throw new BudgetExhaustedError(this.dailyBudget, 0, 0, { session_id: sessionId });
    }
    // Soft limit: warn and continue with optimistic balance
    console.warn(
      `[nexus-pay] Session ${sessionId}: ${reason}, continuing with dailyBudget as balance`,
    );
    this.balance = this.dailyBudget;
  }

  private isBudgetExhausted(): boolean {
    return this.balance <= 0 || this.sessionCost >= this.dailyBudget;
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
        this.transferTimeoutMs,
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

    if (this.hardLimit) {
      throw new BudgetExhaustedError(this.dailyBudget, this.sessionCost, this.balance, {
        session_id: sessionId,
      });
    }
    console.warn(`[nexus-pay] Session ${sessionId}: ${reason}, continuing without reservation`);
  }

  private getEstimatedCost(): number {
    if (this.turnCount <= 1 || this.sessionCost === 0) {
      return this.defaultEstimatedCost;
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
        this.transferTimeoutMs,
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
        this.transferTimeoutMs,
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
        this.transferTimeoutMs,
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
   * Also checks when approaching the lowest unfired alert threshold for accuracy.
   */
  private async maybeReconcileBalance(sessionId: string): Promise<void> {
    const pressure = this.dailyBudget > 0 ? this.sessionCost / this.dailyBudget : 0;

    const isReconciliationTurn = this.turnCount % this.balanceCheckInterval === 0;

    // Find lowest unfired threshold to determine proximity
    const lowestUnfired = this.getLowestUnfiredThreshold();
    const isApproachingThreshold = lowestUnfired !== undefined && pressure >= lowestUnfired * 0.9;

    if (!isReconciliationTurn && !isApproachingThreshold) {
      return;
    }

    try {
      const result = await withTimeout(this.client.pay.getBalance(), this.reconciliationTimeoutMs);

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
   * Extract TokenUsage from turn context metadata.
   *
   * Checks two sources in priority order:
   * 1. context.metadata.usage — direct TokenUsage (primary)
   * 2. context.metadata["modelRouter:usage"] — array of UsageEvents from ModelRouter
   *
   * Uses isTokenUsage type guard from @templar/core for safe validation.
   */
  private extractUsage(context: TurnContext): TokenUsage | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    // Primary: direct TokenUsage in metadata.usage
    if (isTokenUsage(metadata.usage)) {
      return metadata.usage;
    }

    // Secondary: aggregate from ModelRouter usage events
    const routerUsage = metadata["modelRouter:usage"];
    if (Array.isArray(routerUsage) && routerUsage.length > 0) {
      return this.aggregateRouterUsage(routerUsage);
    }

    return undefined;
  }

  /**
   * Aggregate multiple ModelRouter UsageEvents into a single TokenUsage.
   * A turn can produce multiple events due to retries/fallbacks.
   */
  private aggregateRouterUsage(events: readonly unknown[]): TokenUsage | undefined {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let model = "";
    let validCount = 0;

    for (const event of events) {
      if (event === null || typeof event !== "object") continue;
      const e = event as Record<string, unknown>;
      const usage = e.usage;
      if (usage === null || typeof usage !== "object") continue;
      const u = usage as Record<string, unknown>;

      if (typeof u.inputTokens !== "number" || typeof u.outputTokens !== "number") continue;

      inputTokens += u.inputTokens;
      outputTokens += u.outputTokens;
      totalTokens +=
        typeof u.totalTokens === "number" ? u.totalTokens : u.inputTokens + u.outputTokens;
      if (typeof u.totalCost === "number") totalCost += u.totalCost;
      if (typeof u.cacheReadTokens === "number") cacheReadTokens += u.cacheReadTokens;
      if (typeof u.cacheCreationTokens === "number") cacheCreationTokens += u.cacheCreationTokens;
      if (typeof e.model === "string") model = e.model;
      validCount++;
    }

    if (validCount === 0) return undefined;

    return {
      model: model || "unknown",
      inputTokens,
      outputTokens,
      totalTokens,
      ...(totalCost > 0 ? { totalCost } : {}),
      ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
      ...(cacheCreationTokens > 0 ? { cacheCreationTokens } : {}),
    };
  }

  /**
   * Calculate actual cost from token usage.
   * Priority: costCalculator callback > usage.totalCost > defaultEstimatedCost.
   */
  private calculateCost(usage: TokenUsage | undefined): number {
    if (usage !== undefined && this.costCalculator !== undefined) {
      return this.costCalculator(usage.model ?? "unknown", usage);
    }

    if (usage?.totalCost !== undefined) {
      return usage.totalCost;
    }

    return this.defaultEstimatedCost;
  }

  /**
   * Update per-model cost tracking with full token breakdown.
   */
  private updateModelCosts(usage: TokenUsage, cost: number): void {
    const model = usage.model ?? "unknown";
    const usageTotalTokens = usage.totalTokens ?? usage.inputTokens + usage.outputTokens;
    const existing = this.perModelCosts.get(model);
    const updated: ModelCostEntry = {
      totalCost: (existing?.totalCost ?? 0) + cost,
      inputTokens: (existing?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (existing?.outputTokens ?? 0) + usage.outputTokens,
      totalTokens: (existing?.totalTokens ?? 0) + usageTotalTokens,
      requestCount: (existing?.requestCount ?? 0) + 1,
      cacheReadTokens: (existing?.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
      cacheCreationTokens: (existing?.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0),
    };

    const newMap = new Map(this.perModelCosts);
    newMap.set(model, updated);
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
   * Check if any alert thresholds have been crossed and emit warnings.
   * Each threshold fires at most once per session.
   */
  private async checkBudgetThresholds(sessionId: string): Promise<void> {
    if (this.dailyBudget <= 0) {
      return;
    }

    const pressure = this.sessionCost / this.dailyBudget;

    // Check each threshold
    for (const threshold of this.alertThresholds) {
      if (this.firedThresholds.has(threshold)) continue;
      if (pressure < threshold) continue;

      // Fire this threshold
      const newFired = new Set(this.firedThresholds);
      newFired.add(threshold);
      this.firedThresholds = newFired;

      if (this.onBudgetWarningCb !== undefined) {
        try {
          await this.onBudgetWarningCb({
            sessionId,
            budget: this.dailyBudget,
            spent: this.sessionCost,
            remaining: this.balance,
            pressure,
            threshold,
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
    if (this.isBudgetExhausted() && this.onBudgetExhaustedCb !== undefined) {
      // Only fire exhausted callback once (use threshold 1.0 as sentinel)
      if (!this.firedThresholds.has(-1)) {
        const newFired = new Set(this.firedThresholds);
        newFired.add(-1);
        this.firedThresholds = newFired;

        try {
          await this.onBudgetExhaustedCb({
            sessionId,
            budget: this.dailyBudget,
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
  }

  /**
   * Get the lowest unfired threshold, or undefined if all have fired.
   */
  private getLowestUnfiredThreshold(): number | undefined {
    let lowest: number | undefined;
    for (const threshold of this.alertThresholds) {
      if (this.firedThresholds.has(threshold)) continue;
      if (lowest === undefined || threshold < lowest) {
        lowest = threshold;
      }
    }
    return lowest;
  }

  /**
   * Inject PSI-style budget pressure metrics into turn context metadata.
   */
  private injectBudgetPressure(context: TurnContext): void {
    const totalCacheRequests = this.cacheStats.hits + this.cacheStats.misses;

    const pressure: BudgetPressure = {
      remaining: this.balance,
      dailyBudget: this.dailyBudget,
      pressure: this.dailyBudget > 0 ? this.sessionCost / this.dailyBudget : 0,
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
  if (!Number.isFinite(config.dailyBudget) || config.dailyBudget < 0) {
    throw new PayConfigurationError(`dailyBudget must be >= 0, got ${config.dailyBudget}`);
  }

  // Validate legacy alertThreshold
  if (
    config.alertThreshold !== undefined &&
    (!Number.isFinite(config.alertThreshold) ||
      config.alertThreshold < 0 ||
      config.alertThreshold > 1)
  ) {
    throw new PayConfigurationError(
      `alertThreshold must be between 0 and 1, got ${config.alertThreshold}`,
    );
  }

  // Validate alertThresholds array
  if (config.alertThresholds !== undefined) {
    const thresholds =
      typeof config.alertThresholds === "number"
        ? [config.alertThresholds]
        : config.alertThresholds;
    for (const t of thresholds) {
      if (!Number.isFinite(t) || t < 0 || t > 1) {
        throw new PayConfigurationError(`alertThresholds values must be between 0 and 1, got ${t}`);
      }
    }
  }

  if (
    config.balanceCheckInterval !== undefined &&
    (!Number.isFinite(config.balanceCheckInterval) || config.balanceCheckInterval < 1)
  ) {
    throw new PayConfigurationError(
      `balanceCheckInterval must be >= 1, got ${config.balanceCheckInterval}`,
    );
  }

  if (
    config.balanceCheckTimeoutMs !== undefined &&
    (!Number.isFinite(config.balanceCheckTimeoutMs) || config.balanceCheckTimeoutMs < 0)
  ) {
    throw new PayConfigurationError(
      `balanceCheckTimeoutMs must be >= 0, got ${config.balanceCheckTimeoutMs}`,
    );
  }

  if (
    config.transferTimeoutMs !== undefined &&
    (!Number.isFinite(config.transferTimeoutMs) || config.transferTimeoutMs < 0)
  ) {
    throw new PayConfigurationError(
      `transferTimeoutMs must be >= 0, got ${config.transferTimeoutMs}`,
    );
  }

  if (
    config.reconciliationTimeoutMs !== undefined &&
    (!Number.isFinite(config.reconciliationTimeoutMs) || config.reconciliationTimeoutMs < 0)
  ) {
    throw new PayConfigurationError(
      `reconciliationTimeoutMs must be >= 0, got ${config.reconciliationTimeoutMs}`,
    );
  }

  if (
    config.defaultEstimatedCost !== undefined &&
    (!Number.isFinite(config.defaultEstimatedCost) || config.defaultEstimatedCost < 0)
  ) {
    throw new PayConfigurationError(
      `defaultEstimatedCost must be >= 0, got ${config.defaultEstimatedCost}`,
    );
  }
}
