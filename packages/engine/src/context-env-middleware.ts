/**
 * Context environment middleware — builds & exposes TemplarRuntimeContext (#128)
 *
 * This middleware is auto-prepended by createTemplar() as the first middleware.
 * It builds a TemplarRuntimeContext from SessionContext fields on session start.
 *
 * IMPORTANT: AsyncLocalStorage scoping
 * The actual `runWithContext()` call must happen at the EXECUTION boundary —
 * i.e., the code that drives the agent loop must call `runWithContext(ctx, fn)`.
 * This middleware provides `buildRuntimeContext()` for that purpose.
 *
 * For convenience, createTemplar() returns a wrapped agent whose run/invoke
 * methods automatically call runWithContext(). See `wrapWithContext()`.
 */

import type { SessionContext, TemplarMiddleware, TemplarRuntimeContext } from "@templar/core";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ContextEnvMiddlewareConfig {
  /** Nexus zone ID (from TemplarConfig.zoneId or manifest) */
  readonly zoneId?: string;
  /** Fallback: read zone ID from this process.env key if not in config */
  readonly zoneIdEnvKey?: string;
}

const DEFAULT_ZONE_ID_ENV_KEY = "NEXUS_ZONE_ID";

// ---------------------------------------------------------------------------
// Middleware implementation
// ---------------------------------------------------------------------------

export class ContextEnvMiddleware implements TemplarMiddleware {
  readonly name = "templar-context-env";
  private readonly config: ContextEnvMiddlewareConfig;

  /** Per-session runtime contexts, keyed by sessionId (concurrent-safe). */
  private readonly _contexts = new Map<string, TemplarRuntimeContext>();

  constructor(config?: ContextEnvMiddlewareConfig) {
    this.config = config ?? {};
  }

  /**
   * On session start, build and store the runtime context.
   *
   * NOTE: This does NOT call runWithContext() — AsyncLocalStorage scoping
   * must happen at the execution boundary (see wrapWithContext).
   * This hook stores the built context so it can be retrieved by the
   * execution wrapper or by callers via getLastContext().
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    this._contexts.set(context.sessionId, this.buildRuntimeContext(context));
  }

  /**
   * Clear stored context on session end.
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    this._contexts.delete(context.sessionId);
  }

  /**
   * Get the runtime context for a specific session, or the most recent
   * context if no sessionId is provided (backward compatibility).
   *
   * @returns The runtime context, or undefined if no session is active.
   */
  getLastContext(sessionId?: string): TemplarRuntimeContext | undefined {
    if (sessionId !== undefined) {
      return this._contexts.get(sessionId);
    }
    // Backward compat: return the last entry (for single-session scenarios)
    if (this._contexts.size === 0) return undefined;
    let last: TemplarRuntimeContext | undefined;
    for (const ctx of this._contexts.values()) {
      last = ctx;
    }
    return last;
  }

  /**
   * Build a TemplarRuntimeContext from the given SessionContext.
   *
   * Resolves zoneId from: config.zoneId > context.zoneId > process.env[zoneIdEnvKey] > undefined
   *
   * Uses conditional property spreading to satisfy exactOptionalPropertyTypes —
   * optional properties are omitted entirely rather than set to undefined.
   */
  buildRuntimeContext(context: SessionContext): TemplarRuntimeContext {
    const zoneIdEnvKey = this.config.zoneIdEnvKey ?? DEFAULT_ZONE_ID_ENV_KEY;
    const envZoneId = process.env[zoneIdEnvKey];
    const zoneId =
      this.config.zoneId ?? context.zoneId ?? (envZoneId !== "" ? envZoneId : undefined);

    return {
      sessionId: context.sessionId,
      ...(context.agentId !== undefined ? { agentId: context.agentId } : {}),
      ...(context.userId !== undefined ? { userId: context.userId } : {}),
      ...(context.channelType !== undefined ? { channelType: context.channelType } : {}),
      ...(zoneId !== undefined ? { zoneId } : {}),
      ...(context.nodeId !== undefined ? { nodeId: context.nodeId } : {}),
      ...(context.metadata !== undefined ? { metadata: context.metadata } : {}),
    };
  }
}

/**
 * Create a ContextEnvMiddleware instance.
 */
export function createContextEnvMiddleware(
  config?: ContextEnvMiddlewareConfig,
): ContextEnvMiddleware {
  return new ContextEnvMiddleware(config);
}
