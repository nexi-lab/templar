/**
 * VoiceEvolutionMiddleware — Memory-derived personality drift.
 *
 * Periodically queries Nexus Memory to derive personality modifiers,
 * then injects them into the system prompt via wrapModelCall().
 *
 * Decision 3: wrapModelCall() injection
 * Decision 7: Modifier count/weight cap
 * Decision 13: Cache + interval recompute
 * Decision 15: withTimeout + graceful degradation
 */

import type {
  ModelHandler,
  ModelRequest,
  ModelResponse,
  SessionContext,
  TemplarMiddleware,
} from "@templar/core";
import { resolveVoiceEvolutionConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import { ModifierCache } from "./modifier-cache.js";
import type { ResolvedVoiceEvolutionConfig, VoiceEvolutionConfig } from "./types.js";
import { withTimeout } from "../shared/with-timeout.js";

export class VoiceEvolutionMiddleware implements TemplarMiddleware {
  readonly name: string = PACKAGE_NAME;

  private readonly config: ResolvedVoiceEvolutionConfig;

  // Cached modifier state (immutable — reassigned, never mutated)
  private modifierCache: ModifierCache;

  // Refresh timer
  private refreshTimerId: ReturnType<typeof globalThis.setTimeout> | undefined;

  constructor(config: VoiceEvolutionConfig) {
    this.config = resolveVoiceEvolutionConfig(config);
    this.modifierCache = ModifierCache.empty(this.config.maxDrift);
  }

  // ---------------------------------------------------------------------------
  // TemplarMiddleware lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(_context: SessionContext): Promise<void> {
    // Initial modifier load
    await this.refreshModifiers();

    // Start periodic refresh (Decision 13)
    this.startRefreshTimer();
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    this.stopRefreshTimer();
  }

  /**
   * Inject cached personality modifiers into the system prompt (Decision 3).
   *
   * Hot path: just string concatenation with cached suffix — sub-millisecond.
   */
  async wrapModelCall(req: ModelRequest, next: ModelHandler): Promise<ModelResponse> {
    const suffix = this.modifierCache.getPromptSuffix();

    if (suffix.length === 0) {
      return next(req);
    }

    const basePrompt = req.systemPrompt ?? "";
    const modifiedPrompt = basePrompt.length > 0 ? `${basePrompt}\n\n${suffix}` : suffix;

    const modifiedReq: ModelRequest = {
      ...req,
      systemPrompt: modifiedPrompt,
    };

    return next(modifiedReq);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Get current modifier cache (for diagnostics). */
  getModifierCache(): ModifierCache {
    return this.modifierCache;
  }

  /** Force a modifier refresh (for testing or manual trigger). */
  async forceRefresh(): Promise<void> {
    await this.refreshModifiers();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private startRefreshTimer(): void {
    this.refreshTimerId = this.config.clock.setTimeout(() => {
      void this.onRefreshTick();
    }, this.config.updateIntervalMs);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimerId !== undefined) {
      this.config.clock.clearTimeout(this.refreshTimerId);
      this.refreshTimerId = undefined;
    }
  }

  private async onRefreshTick(): Promise<void> {
    await this.refreshModifiers();

    // Schedule next tick (recursive setTimeout for drift compensation)
    this.startRefreshTimer();
  }

  /**
   * Query Nexus Memory and rebuild modifier cache (Decision 15).
   *
   * On timeout or error, keeps previous modifiers (graceful degradation).
   */
  private async refreshModifiers(): Promise<void> {
    try {
      const result = await withTimeout(
        this.config.nexusClient.memory.query({
          scope: this.config.memoryQueryScope,
          limit: 50,
        }),
        this.config.queryTimeoutMs,
      );

      if (result === undefined) {
        // Timeout — keep previous modifiers
        return;
      }

      const memories = result.results ?? [];
      const newModifiers = this.config.modifierBuilder(memories);

      // Replace cache with new modifiers, enforcing weight cap
      this.modifierCache = this.modifierCache.replaceAll(newModifiers);
    } catch {
      // API error — degrade gracefully, keep previous modifiers
    }
  }
}

/**
 * Factory function for VoiceEvolutionMiddleware.
 */
export function createVoiceEvolutionMiddleware(
  config: VoiceEvolutionConfig,
): VoiceEvolutionMiddleware {
  return new VoiceEvolutionMiddleware(config);
}
