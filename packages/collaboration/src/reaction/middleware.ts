/**
 * ReactionMiddleware — Event-triggered agent responses.
 *
 * Subscribes to events via an injectable EventSource and fires reactions
 * based on glob pattern matching, probability gating, and cooldown enforcement.
 */

import type { SessionContext, TemplarMiddleware } from "@templar/core";
import { parseDuration } from "../shared/duration.js";
import { resolveReactionConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import { InMemoryEventSource } from "./event-source.js";
import { createEventMatcher, matchesFilters } from "./matcher.js";
import type {
  EventSource,
  NexusEvent,
  ReactionConfig,
  ReactionPattern,
  ResolvedReactionConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Compiled pattern — pre-compiled matcher + parsed cooldown
// ---------------------------------------------------------------------------

interface CompiledPattern {
  readonly pattern: ReactionPattern;
  readonly matcher: (eventType: string) => boolean;
  readonly cooldownMs: number;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export class ReactionMiddleware implements TemplarMiddleware {
  readonly name: string = PACKAGE_NAME;

  private readonly config: ResolvedReactionConfig;
  private readonly compiledPatterns: readonly CompiledPattern[];
  private eventSource: EventSource;

  // Cooldown state — Map<action, lastFiredTimestamp>
  // Immutable: reassigned on each update (never mutated in-place)
  private lastFiredMap: ReadonlyMap<string, number> = new Map();

  // Reaction count for diagnostics
  private reactionCount = 0;

  constructor(config: ReactionConfig) {
    this.config = resolveReactionConfig(config);

    // Pre-compile all patterns for fast matching
    this.compiledPatterns = this.config.patterns.map((pattern) => ({
      pattern,
      matcher: createEventMatcher(pattern.event),
      cooldownMs: parseDuration(pattern.cooldown),
    }));

    // Use provided EventSource or create a default InMemoryEventSource
    this.eventSource = this.config.eventSource ?? new InMemoryEventSource();
  }

  // ---------------------------------------------------------------------------
  // TemplarMiddleware lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(_context: SessionContext): Promise<void> {
    this.eventSource.start((event) => {
      void this.handleEvent(event);
    });
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    await this.eventSource.stop();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Get the number of reactions that have fired. */
  getReactionCount(): number {
    return this.reactionCount;
  }

  /** Get the underlying event source (useful for testing with InMemoryEventSource). */
  getEventSource(): EventSource {
    return this.eventSource;
  }

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------

  private async handleEvent(event: NexusEvent): Promise<void> {
    for (const compiled of this.compiledPatterns) {
      // 1. Pattern match
      if (!compiled.matcher(event.type)) continue;

      // 2. Additional filters
      if (!matchesFilters(compiled.pattern.match, event.payload)) continue;

      // 3. Cooldown check
      if (!this.isCooldownExpired(compiled.pattern.action, compiled.cooldownMs)) continue;

      // 4. Probability gate
      if (this.config.rng() >= compiled.pattern.probability) continue;

      // All checks passed — fire reaction
      this.recordFired(compiled.pattern.action);
      this.reactionCount += 1;

      try {
        await this.config.onReaction(compiled.pattern, event);
      } catch {
        // Graceful degradation — reaction handler failure doesn't crash middleware
      }
    }
  }

  private isCooldownExpired(action: string, cooldownMs: number): boolean {
    // Zero cooldown always passes
    if (cooldownMs === 0) return true;

    const lastFired = this.lastFiredMap.get(action);
    if (lastFired === undefined) return true;

    const elapsed = this.config.clock.now() - lastFired;
    return elapsed >= cooldownMs;
  }

  private recordFired(action: string): void {
    // Immutable Map update
    const updated = new Map(this.lastFiredMap);
    updated.set(action, this.config.clock.now());
    this.lastFiredMap = updated;
  }
}

/**
 * Factory function for ReactionMiddleware.
 */
export function createReactionMiddleware(config: ReactionConfig): ReactionMiddleware {
  return new ReactionMiddleware(config);
}
