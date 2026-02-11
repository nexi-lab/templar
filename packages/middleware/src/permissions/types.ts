/**
 * Permissions middleware types — tool-level permission enforcement
 *
 * Supports three permission patterns: allow, deny, ask (human-in-the-loop).
 * Uses ReBAC via Nexus API with progressive allowlisting and circuit breaker.
 */

import type { TurnContext } from "@templar/core";

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

/**
 * Permission resolution pattern for a tool.
 *
 * - "allow": Tool call proceeds without any check
 * - "deny": Tool call is blocked unconditionally
 * - "ask": Human-in-the-loop approval required
 * - "check": Consult the Nexus ReBAC API (with cache + circuit breaker)
 */
export type PermissionPattern = "allow" | "deny" | "ask" | "check";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for NexusPermissionsMiddleware.
 */
export interface NexusPermissionsConfig {
  /** Default permission pattern for tools not listed in toolPermissions (required) */
  defaultPattern: PermissionPattern;

  /** Per-tool permission overrides (bypass ReBAC) */
  toolPermissions?: Record<string, PermissionPattern>;

  /** Enable progressive allowlisting (auto-grant after N approvals) (default: false) */
  progressiveAllowlist?: boolean;

  /** Number of HITL approvals before auto-granting (default: 3) */
  progressiveThreshold?: number;

  /** HITL callback — required if any tool uses 'ask' pattern */
  onPermissionRequest?: (tool: string, context: TurnContext) => Promise<"allow" | "deny">;

  /** Timeout for permission check API calls in ms (default: 3000) */
  checkTimeoutMs?: number;

  /** Timeout for permission grant API calls in ms (default: 5000) */
  grantTimeoutMs?: number;

  /** Timeout for namespace query API calls in ms (default: 3000) */
  namespaceQueryTimeoutMs?: number;

  /** Whether to deny on API failure (zero-trust) (default: true) */
  denyOnFailure?: boolean;

  /** Permission cache TTL in ms (default: 300000 = 5 min) */
  cacheTTLMs?: number;

  /** Injectable clock for circuit breaker timing in tests */
  clock?: { now(): number };
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default configuration values.
 */
export const DEFAULT_PERMISSIONS_CONFIG = {
  progressiveAllowlist: false,
  progressiveThreshold: 3,
  checkTimeoutMs: 3000,
  grantTimeoutMs: 5000,
  namespaceQueryTimeoutMs: 3000,
  denyOnFailure: true,
  cacheTTLMs: 300_000,
} as const;

/**
 * Circuit breaker defaults.
 */
export const CIRCUIT_BREAKER_DEFAULTS = {
  failureThreshold: 3,
  cooldownMs: 30_000,
} as const;

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * A cached permission decision with TTL.
 */
export interface CachedPermission {
  readonly result: "allow" | "deny";
  readonly expiresAt: number;
}

/**
 * Circuit breaker state machine states.
 */
export type CircuitState = "closed" | "open" | "half-open";
