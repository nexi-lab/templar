/**
 * NexusPermissionsMiddleware — tool-level permission enforcement via Nexus ReBAC.
 *
 * Checks permissions before every tool call, supports human-in-the-loop
 * approval, progressive allowlisting, and namespace-based tool visibility.
 *
 * Evaluation order:
 * 1. Local overrides (toolPermissions)
 * 2. Cache hit
 * 3. Circuit breaker check
 * 4. ReBAC API call
 *
 * Features:
 * - Namespace tool preloading at session start
 * - HITL ask pattern with configurable callback
 * - Progressive allowlisting (auto-grant after N approvals)
 * - Session-scoped permission cache with TTL
 * - Circuit breaker for API resilience
 * - Configurable deny-on-failure (zero-trust default)
 */

import type { NexusClient } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { PermissionConfigurationError, PermissionDeniedError } from "@templar/errors";
import { logWarn, safeCall } from "../utils.js";
import {
  type CachedPermission,
  CIRCUIT_BREAKER_DEFAULTS,
  type CircuitState,
  DEFAULT_PERMISSIONS_CONFIG,
  type NexusPermissionsConfig,
} from "./types.js";

/**
 * NexusPermissionsMiddleware enforces tool-level permissions using Nexus ReBAC
 * and the namespace security model.
 */
export class NexusPermissionsMiddleware implements TemplarMiddleware {
  readonly name = "nexus-permissions";

  private readonly client: NexusClient;
  private readonly config: NexusPermissionsConfig;
  private readonly clock: { now(): number };

  // State — reassigned immutably, never mutated
  private visibleTools: ReadonlySet<string> = new Set();
  private permissionCache: ReadonlyMap<string, CachedPermission> = new Map();
  private approvalCounts: ReadonlyMap<string, number> = new Map();
  private circuitBreaker: Readonly<{
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureAt: number;
  }> = { state: "closed", consecutiveFailures: 0, lastFailureAt: 0 };

  constructor(client: NexusClient, config: NexusPermissionsConfig) {
    this.client = client;
    this.config = config;
    this.clock = config.clock ?? { now: () => Date.now() };
  }

  // ===========================================================================
  // LIFECYCLE HOOKS
  // ===========================================================================

  /**
   * Query namespace-visible tools and reset state.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    this.resetState();

    const sessionId = context.sessionId;
    const timeoutMs =
      this.config.namespaceQueryTimeoutMs ?? DEFAULT_PERMISSIONS_CONFIG.namespaceQueryTimeoutMs;

    // Query namespace tools — graceful degradation on failure
    const namespace = this.extractNamespace(context);
    if (namespace !== undefined) {
      const result = await safeCall(
        () =>
          this.client.permissions.listNamespaceTools({
            namespace,
            ...(context.agentId !== undefined ? { subject: context.agentId } : {}),
          }),
        timeoutMs,
        this.name,
        sessionId,
      );

      if (result !== undefined) {
        this.visibleTools = new Set(result.tools);
      } else {
        logWarn(this.name, sessionId, "namespace query failed, using empty visible tools set");
      }
    }

    // Inject visible tools into metadata for downstream consumers
    context.metadata = {
      ...(context.metadata ?? {}),
      visibleTools: [...this.visibleTools],
    };
  }

  /**
   * Check tool permission before the turn executes.
   */
  async onBeforeTurn(context: TurnContext): Promise<void> {
    const toolCall = this.extractToolCall(context);
    if (toolCall === undefined) {
      return;
    }

    const toolName = toolCall;

    const result = await this.resolvePermission(toolName, context);

    if (result === "deny") {
      throw new PermissionDeniedError(toolName, "execute", "denied by permission policy");
    }

    // Inject permission result into metadata for audit middleware
    context.metadata = {
      ...(context.metadata ?? {}),
      permissionCheck: {
        resource: toolName,
        action: "execute",
        granted: true,
      },
    };
  }

  /**
   * No-op — permission checks are pre-turn only.
   */
  async onAfterTurn(_context: TurnContext): Promise<void> {
    // Intentionally empty
  }

  /**
   * Clear all state on session end.
   */
  async onSessionEnd(_context: SessionContext): Promise<void> {
    this.resetState();
  }

  // ===========================================================================
  // PERMISSION RESOLUTION
  // ===========================================================================

  /**
   * Resolve permission for a tool. Evaluation order:
   * 1. Local overrides (toolPermissions)
   * 2. Cache hit
   * 3. Circuit breaker → fallback
   * 4. ReBAC API call
   */
  private async resolvePermission(tool: string, context: TurnContext): Promise<"allow" | "deny"> {
    const sessionId = context.sessionId;
    const toolPermissions = this.config.toolPermissions;

    // 1. Check explicit per-tool overrides first
    if (toolPermissions !== undefined && tool in toolPermissions) {
      const pattern = toolPermissions[tool];

      if (pattern === "allow") {
        return "allow";
      }
      if (pattern === "deny") {
        return "deny";
      }
      if (pattern === "ask") {
        return this.handleAskPattern(tool, context);
      }
      if (pattern === "check") {
        return this.checkWithReBACFallback(tool, sessionId);
      }
    }

    // 2. Tool not in overrides — apply defaultPattern
    const defaultPattern = this.config.defaultPattern;

    if (defaultPattern === "allow") {
      return "allow";
    }
    if (defaultPattern === "deny") {
      return "deny";
    }
    if (defaultPattern === "ask") {
      return this.handleAskPattern(tool, context);
    }

    // 3. defaultPattern is "check" — consult ReBAC API (cache → circuit breaker → API)
    return this.checkWithReBACFallback(tool, sessionId);
  }

  /**
   * Handle the 'ask' pattern: invoke the HITL callback.
   */
  private async handleAskPattern(tool: string, context: TurnContext): Promise<"allow" | "deny"> {
    const sessionId = context.sessionId;
    const callback = this.config.onPermissionRequest;

    if (callback === undefined) {
      logWarn(this.name, sessionId, `ask pattern for tool '${tool}' but no callback configured`);
      return "deny";
    }

    try {
      const decision = await callback(tool, context);

      if (decision === "allow") {
        // Increment progressive counter
        if (this.config.progressiveAllowlist ?? DEFAULT_PERMISSIONS_CONFIG.progressiveAllowlist) {
          const newCount = this.incrementApprovalCount(tool);
          const threshold =
            this.config.progressiveThreshold ?? DEFAULT_PERMISSIONS_CONFIG.progressiveThreshold;

          if (newCount >= threshold) {
            void this.tryProgressiveGrant(tool, sessionId);
          }
        }
      }

      return decision;
    } catch (error) {
      logWarn(
        this.name,
        sessionId,
        `ask callback failed for tool '${tool}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return "deny";
    }
  }

  /**
   * Check permission via ReBAC API with cache and circuit breaker.
   */
  private async checkWithReBACFallback(tool: string, sessionId: string): Promise<"allow" | "deny"> {
    // 2. Check cache
    const cached = this.getCachedPermission(tool);
    if (cached !== undefined) {
      return cached;
    }

    // 3. Check circuit breaker
    if (this.isCircuitOpen()) {
      logWarn(this.name, sessionId, `circuit open, skipping API check for tool '${tool}'`);
      return this.getFallbackResult();
    }

    // 4. ReBAC API call
    return this.checkReBAC(tool, sessionId);
  }

  /**
   * Call the ReBAC API to check permission.
   */
  private async checkReBAC(tool: string, sessionId: string): Promise<"allow" | "deny"> {
    const timeoutMs = this.config.checkTimeoutMs ?? DEFAULT_PERMISSIONS_CONFIG.checkTimeoutMs;

    const result = await safeCall(
      () =>
        this.client.permissions.checkPermission({
          subject: sessionId,
          action: "execute",
          resource: tool,
        }),
      timeoutMs,
      this.name,
      sessionId,
    );

    if (result === undefined) {
      // API failure
      this.recordFailure();
      return this.getFallbackResult();
    }

    // API success
    this.recordSuccess();
    const decision = result.allowed ? "allow" : "deny";
    this.cachePermission(tool, decision);
    return decision;
  }

  // ===========================================================================
  // PROGRESSIVE ALLOWLISTING
  // ===========================================================================

  /**
   * Increment the approval count for a tool. Returns the new count.
   */
  private incrementApprovalCount(tool: string): number {
    const current = this.approvalCounts.get(tool) ?? 0;
    const newCount = current + 1;
    this.approvalCounts = new Map([...this.approvalCounts, [tool, newCount]]);
    return newCount;
  }

  /**
   * Attempt to grant a persistent permission via the API (fire-and-forget).
   */
  private async tryProgressiveGrant(tool: string, sessionId: string): Promise<void> {
    const timeoutMs = this.config.grantTimeoutMs ?? DEFAULT_PERMISSIONS_CONFIG.grantTimeoutMs;

    const result = await safeCall(
      () =>
        this.client.permissions.grantPermission({
          subject: sessionId,
          action: "execute",
          resource: tool,
        }),
      timeoutMs,
      this.name,
      sessionId,
    );

    if (result !== undefined) {
      // Cache as allowed after successful grant
      this.cachePermission(tool, "allow");
      logWarn(
        this.name,
        sessionId,
        `progressive grant succeeded for tool '${tool}' (permission: ${result.permission_id})`,
      );
    } else {
      logWarn(this.name, sessionId, `progressive grant failed for tool '${tool}'`);
    }
  }

  // ===========================================================================
  // PERMISSION CACHE
  // ===========================================================================

  /**
   * Get a cached permission if valid (not expired).
   */
  private getCachedPermission(tool: string): "allow" | "deny" | undefined {
    const entry = this.permissionCache.get(tool);
    if (entry === undefined) {
      return undefined;
    }

    if (this.clock.now() >= entry.expiresAt) {
      // Expired — remove from cache
      const updated = new Map(this.permissionCache);
      updated.delete(tool);
      this.permissionCache = updated;
      return undefined;
    }

    return entry.result;
  }

  /**
   * Cache a permission result with TTL.
   */
  private cachePermission(tool: string, result: "allow" | "deny"): void {
    const ttl = this.config.cacheTTLMs ?? DEFAULT_PERMISSIONS_CONFIG.cacheTTLMs;
    const entry: CachedPermission = {
      result,
      expiresAt: this.clock.now() + ttl,
    };
    this.permissionCache = new Map([...this.permissionCache, [tool, entry]]);
  }

  // ===========================================================================
  // CIRCUIT BREAKER
  // ===========================================================================

  /**
   * Check if the circuit breaker is open.
   * In half-open state, allows a single probe through.
   */
  private isCircuitOpen(): boolean {
    const { state, lastFailureAt } = this.circuitBreaker;

    if (state === "closed") {
      return false;
    }

    if (state === "open") {
      // Check if cooldown has elapsed → transition to half-open
      const elapsed = this.clock.now() - lastFailureAt;
      if (elapsed >= CIRCUIT_BREAKER_DEFAULTS.cooldownMs) {
        this.circuitBreaker = { ...this.circuitBreaker, state: "half-open" };
        return false; // Allow probe
      }
      return true; // Still open
    }

    // half-open — allow probe
    return false;
  }

  /**
   * Record an API failure. Atomically updates circuit breaker state.
   * Transitions to 'open' when failureThreshold is reached.
   */
  private recordFailure(): void {
    const newFailures = this.circuitBreaker.consecutiveFailures + 1;
    this.circuitBreaker = {
      state:
        newFailures >= CIRCUIT_BREAKER_DEFAULTS.failureThreshold
          ? "open"
          : this.circuitBreaker.state,
      consecutiveFailures: newFailures,
      lastFailureAt: this.clock.now(),
    };
  }

  /**
   * Record an API success. Atomically resets circuit breaker to closed.
   */
  private recordSuccess(): void {
    this.circuitBreaker = { state: "closed", consecutiveFailures: 0, lastFailureAt: 0 };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Get the fallback result based on denyOnFailure config.
   */
  private getFallbackResult(): "allow" | "deny" {
    const denyOnFailure = this.config.denyOnFailure ?? DEFAULT_PERMISSIONS_CONFIG.denyOnFailure;
    return denyOnFailure ? "deny" : "allow";
  }

  /**
   * Extract the tool name from turn context metadata.
   */
  private extractToolCall(context: TurnContext): string | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    const toolCall = metadata.toolCall;
    if (toolCall === undefined || typeof toolCall !== "object" || toolCall === null) {
      return undefined;
    }

    const record = toolCall as Record<string, unknown>;
    if (typeof record.name === "string") {
      return record.name;
    }

    return undefined;
  }

  /**
   * Extract namespace from session context metadata.
   */
  private extractNamespace(context: SessionContext): string | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    const namespace = metadata.namespace;
    if (typeof namespace === "string") {
      return namespace;
    }

    return undefined;
  }

  /**
   * Reset all internal state.
   */
  private resetState(): void {
    this.visibleTools = new Set();
    this.permissionCache = new Map();
    this.approvalCounts = new Map();
    this.circuitBreaker = { state: "closed", consecutiveFailures: 0, lastFailureAt: 0 };
  }
}

// ===========================================================================
// CONFIG VALIDATION
// ===========================================================================

/**
 * Validate NexusPermissionsConfig.
 * @throws {PermissionConfigurationError} if config is invalid
 */
export function validatePermissionsConfig(config: NexusPermissionsConfig): void {
  const issues: string[] = [];

  // Check that 'ask' pattern has a callback
  const hasAskDefault = config.defaultPattern === "ask";
  const hasAskTool = Object.values(config.toolPermissions ?? {}).some((p) => p === "ask");

  if ((hasAskDefault || hasAskTool) && config.onPermissionRequest === undefined) {
    issues.push(
      "onPermissionRequest callback is required when any tool or defaultPattern uses 'ask'",
    );
  }

  // Validate progressiveThreshold
  if (config.progressiveThreshold !== undefined && config.progressiveThreshold < 1) {
    issues.push(`progressiveThreshold must be >= 1, got ${config.progressiveThreshold}`);
  }

  // Validate timeouts
  if (config.checkTimeoutMs !== undefined && config.checkTimeoutMs < 1) {
    issues.push(`checkTimeoutMs must be >= 1, got ${config.checkTimeoutMs}`);
  }

  if (config.grantTimeoutMs !== undefined && config.grantTimeoutMs < 1) {
    issues.push(`grantTimeoutMs must be >= 1, got ${config.grantTimeoutMs}`);
  }

  if (config.namespaceQueryTimeoutMs !== undefined && config.namespaceQueryTimeoutMs < 1) {
    issues.push(`namespaceQueryTimeoutMs must be >= 1, got ${config.namespaceQueryTimeoutMs}`);
  }

  // Validate cacheTTL
  if (config.cacheTTLMs !== undefined && config.cacheTTLMs < 0) {
    issues.push(`cacheTTLMs must be >= 0, got ${config.cacheTTLMs}`);
  }

  // Validate defaultPattern
  const validPatterns = new Set(["allow", "deny", "ask", "check"]);
  if (!validPatterns.has(config.defaultPattern)) {
    issues.push(
      `Invalid defaultPattern: "${config.defaultPattern}". Must be one of: allow, deny, ask`,
    );
  }

  if (issues.length > 0) {
    throw new PermissionConfigurationError(issues.join("; "), issues);
  }
}
