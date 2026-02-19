/**
 * DelegationManager — Task delegation lifecycle with fault-tolerant fallback.
 *
 * Manages the full delegation lifecycle: request → accept → result,
 * with per-node circuit breakers, concurrency limits, TTL sweeping,
 * and optional persistent DelegationStore (graceful degradation).
 */

import { CircuitBreaker, type CircuitBreakerConfig } from "./circuit-breaker.js";
import type { DelegationRecord, DelegationStore } from "./delegation-store.js";
import type {
  DelegationAcceptFrame,
  DelegationCancelFrame,
  DelegationRequestFrame,
  DelegationResultFrame,
  GatewayFrame,
} from "./protocol/frames.js";
import type { NodeRegistry } from "./registry/node-registry.js";
import { createEmitter, type Emitter } from "./utils/emitter.js";
import { mapDelete, mapSet } from "./utils/immutable-map.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DelegationManagerConfig {
  readonly maxActiveDelegations: number;
  readonly maxPerNodeDelegations: number;
  readonly maxDelegationTtlMs: number;
  readonly sweepIntervalMs: number;
  readonly minNodeTimeoutMs: number;
  readonly circuitBreaker: CircuitBreakerConfig;
  readonly storeTimeoutMs: number;
}

const DEFAULT_CONFIG: DelegationManagerConfig = {
  maxActiveDelegations: 100,
  maxPerNodeDelegations: 10,
  maxDelegationTtlMs: 600_000,
  sweepIntervalMs: 60_000,
  minNodeTimeoutMs: 3_000,
  circuitBreaker: { threshold: 5, cooldownMs: 30_000 },
  storeTimeoutMs: 2_000,
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type DelegationEvents = {
  "delegation.started": [delegationId: string, fromNodeId: string, toNodeId: string];
  "delegation.accepted": [delegationId: string, nodeId: string];
  "delegation.failed": [delegationId: string, nodeId: string, reason: string];
  "delegation.exhausted": [delegationId: string, failedNodes: readonly string[]];
  "delegation.completed": [delegationId: string, nodeId: string];
  "delegation.cancelled": [delegationId: string, reason: string];
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveDelegation {
  readonly delegationId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly intent: string;
  readonly createdAt: number;
  readonly abortController: AbortController;
  readonly currentNodeId: string;
}

// ---------------------------------------------------------------------------
// DelegationManager
// ---------------------------------------------------------------------------

export class DelegationManager {
  private readonly config: DelegationManagerConfig;
  private readonly registry: NodeRegistry;
  private readonly sendToNode: (nodeId: string, frame: GatewayFrame) => void;
  private readonly store: DelegationStore | undefined;
  private readonly now: () => number;
  private readonly emitter: Emitter<DelegationEvents> = createEmitter<DelegationEvents>();

  private delegations: ReadonlyMap<string, ActiveDelegation> = new Map();
  private circuitBreakers: ReadonlyMap<string, CircuitBreaker> = new Map();
  private nodeActiveCounts: ReadonlyMap<string, number> = new Map();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * Per-delegation resolver for the current tryNode() call.
   * handleDelegationFrame() resolves these to unblock tryNode().
   */
  private pendingNodeResolvers = new Map<string, (frame: DelegationResultFrame | null) => void>();

  constructor(
    config: Partial<DelegationManagerConfig>,
    registry: NodeRegistry,
    sendToNode: (nodeId: string, frame: GatewayFrame) => void,
    store?: DelegationStore,
    now?: () => number,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry;
    this.sendToNode = sendToNode;
    this.store = store;
    this.now = now ?? Date.now;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get events(): Emitter<DelegationEvents> {
    return this.emitter;
  }

  get activeCount(): number {
    return this.delegations.size;
  }

  /**
   * Delegate a task to the primary node, falling back through alternatives.
   */
  async delegate(req: DelegationRequestFrame): Promise<DelegationResultFrame> {
    // 1. Validate capacity
    if (this.delegations.size >= this.config.maxActiveDelegations) {
      return this.makeResult(req.delegationId, "failed");
    }

    const fromCount = this.nodeActiveCounts.get(req.fromNodeId) ?? 0;
    if (fromCount >= this.config.maxPerNodeDelegations) {
      return this.makeResult(req.delegationId, "failed");
    }

    // 2. Optional store (graceful degradation — Decision 16C)
    if (this.store) {
      await this.storeCreate(req);
    }

    // 3. Set up abort + tracking
    const abortController = new AbortController();
    const overallTimeout = setTimeout(() => abortController.abort(), req.timeoutMs);

    const active: ActiveDelegation = {
      delegationId: req.delegationId,
      fromNodeId: req.fromNodeId,
      toNodeId: req.toNodeId,
      intent: req.intent,
      createdAt: this.now(),
      abortController,
      currentNodeId: req.toNodeId,
    };
    this.delegations = mapSet(this.delegations, req.delegationId, active);
    this.nodeActiveCounts = mapSet(this.nodeActiveCounts, req.fromNodeId, fromCount + 1);

    this.emitter.emit("delegation.started", req.delegationId, req.fromNodeId, req.toNodeId);

    // 4. Try primary node
    const primaryResult = await this.tryNode(req.toNodeId, req, abortController.signal);
    if (primaryResult) {
      clearTimeout(overallTimeout);
      this.cleanup(req.delegationId, req.fromNodeId);
      return primaryResult;
    }

    // 5. Try fallbacks
    const failedNodes: string[] = [req.toNodeId];
    for (const fallbackId of req.fallbackNodeIds) {
      if (abortController.signal.aborted) break;

      const cb = this.getCircuitBreaker(fallbackId);
      if (cb.isOpen && !cb.allowsProbe()) {
        failedNodes.push(fallbackId);
        continue;
      }

      const fallbackResult = await this.tryNode(fallbackId, req, abortController.signal);
      if (fallbackResult) {
        clearTimeout(overallTimeout);
        this.cleanup(req.delegationId, req.fromNodeId);
        return fallbackResult;
      }
      failedNodes.push(fallbackId);
    }

    // 6. All failed
    clearTimeout(overallTimeout);
    this.cleanup(req.delegationId, req.fromNodeId);

    if (abortController.signal.aborted) {
      this.emitter.emit("delegation.failed", req.delegationId, req.toNodeId, "timeout");
      if (this.store) {
        await this.storeUpdate(req.delegationId, "timeout");
      }
      return this.makeResult(req.delegationId, "timeout");
    }

    this.emitter.emit("delegation.exhausted", req.delegationId, failedNodes);
    if (this.store) {
      await this.storeUpdate(req.delegationId, "failed");
    }
    return this.makeResult(req.delegationId, "failed");
  }

  /**
   * Cancel an in-flight delegation.
   */
  cancel(delegationId: string, reason: string): void {
    const active = this.delegations.get(delegationId);
    if (!active) return;

    active.abortController.abort();
    this.sendToNode(active.currentNodeId, {
      kind: "delegation.cancel",
      delegationId,
      reason,
    } satisfies DelegationCancelFrame);

    this.emitter.emit("delegation.cancelled", delegationId, reason);

    // Resolve any pending tryNode() call
    const resolver = this.pendingNodeResolvers.get(delegationId);
    if (resolver) {
      resolver(null);
      this.pendingNodeResolvers.delete(delegationId);
    }

    this.cleanup(delegationId, active.fromNodeId);

    if (this.store) {
      void this.storeUpdate(delegationId, "cancelled");
    }
  }

  /**
   * Handle an incoming delegation frame from a node.
   */
  handleDelegationFrame(frame: DelegationAcceptFrame | DelegationResultFrame): void {
    const active = this.delegations.get(frame.delegationId);
    if (!active) return;

    if (frame.kind === "delegation.accept") {
      this.emitter.emit("delegation.accepted", frame.delegationId, frame.nodeId);
      if (this.store) {
        void this.storeUpdate(frame.delegationId, "accepted");
      }
      return;
    }

    // delegation.result — resolve the pending tryNode() call
    const resolver = this.pendingNodeResolvers.get(frame.delegationId);
    if (resolver) {
      resolver(frame);
      this.pendingNodeResolvers.delete(frame.delegationId);
    }
  }

  /**
   * Remove orphaned delegations older than maxDelegationTtlMs.
   */
  sweep(): void {
    const cutoff = this.now() - this.config.maxDelegationTtlMs;
    const toCancel: string[] = [];
    for (const [id, active] of this.delegations) {
      if (active.createdAt < cutoff) {
        toCancel.push(id);
      }
    }
    for (const id of toCancel) {
      this.cancel(id, "ttl_expired");
    }
  }

  /**
   * Cancel all delegations involving a specific node.
   */
  cleanupNode(nodeId: string): void {
    const toCancel: string[] = [];
    for (const [id, active] of this.delegations) {
      if (active.fromNodeId === nodeId || active.currentNodeId === nodeId) {
        toCancel.push(id);
      }
    }
    for (const id of toCancel) {
      this.cancel(id, `node ${nodeId} disconnected`);
    }
  }

  /**
   * Start periodic sweep timer.
   */
  startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), this.config.sweepIntervalMs);
  }

  /**
   * Dispose: clear all timers, abort all in-flight delegations.
   */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    for (const [id, active] of this.delegations) {
      active.abortController.abort();
      const resolver = this.pendingNodeResolvers.get(id);
      if (resolver) {
        resolver(null);
        this.pendingNodeResolvers.delete(id);
      }
    }
    this.delegations = new Map();
    this.nodeActiveCounts = new Map();
    this.emitter.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async tryNode(
    nodeId: string,
    req: DelegationRequestFrame,
    signal: AbortSignal,
  ): Promise<DelegationResultFrame | null> {
    // Check circuit breaker
    const cb = this.getCircuitBreaker(nodeId);
    if (cb.isOpen && !cb.allowsProbe()) return null;

    // Check abort
    if (signal.aborted) return null;

    // Check node is alive
    const node = this.registry.get(nodeId);
    if (!node?.isAlive) {
      cb.recordFailure();
      this.emitter.emit("delegation.failed", req.delegationId, nodeId, "node_unavailable");
      return null;
    }

    // Calculate time budget (Decision 14A)
    const active = this.delegations.get(req.delegationId);
    const elapsed = this.now() - (active?.createdAt ?? this.now());
    const remainingMs = req.timeoutMs - elapsed;
    if (remainingMs < this.config.minNodeTimeoutMs) return null;
    const nodeBudgetMs = Math.min(
      remainingMs,
      Math.max(
        this.config.minNodeTimeoutMs,
        Math.floor(remainingMs / ((req.fallbackNodeIds.length || 1) + 1)),
      ),
    );

    // Update current node tracking (immutable — replace with new object)
    if (active) {
      this.delegations = mapSet(this.delegations, req.delegationId, {
        ...active,
        currentNodeId: nodeId,
      });
    }

    // Send request to node
    this.sendToNode(nodeId, {
      kind: "delegation.request",
      delegationId: req.delegationId,
      fromNodeId: req.fromNodeId,
      toNodeId: nodeId,
      scope: req.scope,
      intent: req.intent,
      payload: req.payload,
      fallbackNodeIds: [],
      timeoutMs: nodeBudgetMs,
    } satisfies DelegationRequestFrame);

    // Wait for response with node-level timeout
    const result = await new Promise<DelegationResultFrame | null>((resolve) => {
      let settled = false;
      const settle = (value: DelegationResultFrame | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(nodeTimer);
        signal.removeEventListener("abort", onAbort);
        this.pendingNodeResolvers.delete(req.delegationId);
        resolve(value);
      };

      const nodeTimer = setTimeout(() => {
        settle(null);
      }, nodeBudgetMs);

      const onAbort = () => settle(null);
      signal.addEventListener("abort", onAbort, { once: true });

      // Register resolver for handleDelegationFrame
      this.pendingNodeResolvers.set(req.delegationId, (frame) => {
        settle(frame);
      });
    });

    // Process result
    if (result) {
      if (result.status === "completed") {
        cb.recordSuccess();
        this.emitter.emit("delegation.completed", req.delegationId, nodeId);
        if (this.store) {
          void this.storeUpdate(req.delegationId, "completed");
        }
        return result;
      }
      // refused or failed
      cb.recordFailure();
      this.emitter.emit("delegation.failed", req.delegationId, nodeId, result.status);
      if (this.store) {
        void this.storeUpdate(req.delegationId, result.status === "refused" ? "refused" : "failed");
      }
      return null;
    }

    // Timeout or abort — no result
    cb.recordFailure();
    this.emitter.emit("delegation.failed", req.delegationId, nodeId, "timeout");
    return null;
  }

  private getCircuitBreaker(nodeId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(nodeId);
    if (!cb) {
      cb = new CircuitBreaker(this.config.circuitBreaker, this.now);
      this.circuitBreakers = mapSet(this.circuitBreakers, nodeId, cb);
    }
    return cb;
  }

  private cleanup(delegationId: string, fromNodeId: string): void {
    this.delegations = mapDelete(this.delegations, delegationId);
    this.pendingNodeResolvers.delete(delegationId);
    const count = this.nodeActiveCounts.get(fromNodeId) ?? 0;
    if (count <= 1) {
      this.nodeActiveCounts = mapDelete(this.nodeActiveCounts, fromNodeId);
    } else {
      this.nodeActiveCounts = mapSet(this.nodeActiveCounts, fromNodeId, count - 1);
    }
  }

  private makeResult(
    delegationId: string,
    status: DelegationResultFrame["status"],
  ): DelegationResultFrame {
    return {
      kind: "delegation.result",
      delegationId,
      status,
    };
  }

  private async storeCreate(req: DelegationRequestFrame): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.store?.create({
          delegationId: req.delegationId,
          fromNodeId: req.fromNodeId,
          toNodeId: req.toNodeId,
          intent: req.intent,
          status: "pending",
          createdAt: this.now(),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("store timeout")), this.config.storeTimeoutMs);
        }),
      ]);
    } catch {
      // Graceful degradation — proceed without store (Decision 16C)
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async storeUpdate(
    delegationId: string,
    status: DelegationRecord["status"],
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.store?.update(delegationId, status),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("store timeout")), this.config.storeTimeoutMs);
        }),
      ]);
    } catch {
      // Graceful degradation
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
