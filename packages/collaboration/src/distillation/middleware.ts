/**
 * DistillationMiddleware — Post-conversation memory extraction.
 *
 * Buffers turn summaries and extracts structured memories at trigger points
 * (session end, context compact). Extracted memories are written to Nexus Memory.
 *
 * Decision 8: Injectable extractor function
 * Decision 16: Windowed extraction (last N turns)
 */

import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { withTimeout } from "../shared/with-timeout.js";
import { resolveDistillationConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import type {
  DistillationConfig,
  ExtractedMemory,
  ExtractionContext,
  ResolvedDistillationConfig,
  TurnSummary,
} from "./types.js";

export class DistillationMiddleware implements TemplarMiddleware {
  readonly name: string = PACKAGE_NAME;

  private readonly config: ResolvedDistillationConfig;

  // Turn buffer — immutable reassignment (Decision: coding style)
  private turnBuffer: readonly TurnSummary[] = [];

  // Session context for extraction
  private sessionContext: ExtractionContext = { sessionId: "" };

  // Extraction count for diagnostics
  private extractionCount = 0;
  private memoriesStored = 0;

  constructor(config: DistillationConfig) {
    this.config = resolveDistillationConfig(config);
  }

  // ---------------------------------------------------------------------------
  // TemplarMiddleware lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(context: SessionContext): Promise<void> {
    this.sessionContext = {
      sessionId: context.sessionId,
      ...(context.agentId ? { agentId: context.agentId } : {}),
      ...(context.userId ? { userId: context.userId } : {}),
    };
    this.turnBuffer = [];
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    // Buffer the turn summary
    const summary: TurnSummary = {
      turnNumber: context.turnNumber,
      input:
        typeof context.input === "string" ? context.input : JSON.stringify(context.input ?? ""),
      output:
        typeof context.output === "string" ? context.output : JSON.stringify(context.output ?? ""),
    };

    // Windowed buffer: keep only last maxTurns (Decision 16)
    const newBuffer = [...this.turnBuffer, summary];
    if (newBuffer.length > this.config.maxTurns) {
      this.turnBuffer = newBuffer.slice(newBuffer.length - this.config.maxTurns);
    } else {
      this.turnBuffer = newBuffer;
    }

    // Check for context compact trigger
    const isCompact = context.metadata?.contextCompacted === true;
    if (isCompact && this.config.triggers.includes("context_compact")) {
      await this.extractAndFlush();
    }
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    if (this.config.triggers.includes("session_end")) {
      await this.extractAndFlush();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Get diagnostic counters. */
  getDiagnostics(): { extractionCount: number; memoriesStored: number; bufferSize: number } {
    return {
      extractionCount: this.extractionCount,
      memoriesStored: this.memoriesStored,
      bufferSize: this.turnBuffer.length,
    };
  }

  /** Get current turn buffer (for testing). */
  getTurnBuffer(): readonly TurnSummary[] {
    return this.turnBuffer;
  }

  // ---------------------------------------------------------------------------
  // Extraction + flush
  // ---------------------------------------------------------------------------

  private async extractAndFlush(): Promise<void> {
    if (this.turnBuffer.length === 0) return;

    try {
      // Extract memories with timeout (Decision 15 pattern)
      const extracted = await withTimeout(
        this.config.extractor.extract(this.turnBuffer, this.sessionContext),
        this.config.extractionTimeoutMs,
      );

      if (extracted === undefined) {
        // Timeout — skip this extraction, buffer remains for next trigger
        return;
      }

      // Filter by minimum confidence
      const filtered = extracted.filter((m) => m.confidence >= this.config.minConfidence);

      if (filtered.length > 0) {
        await this.storeMemories(filtered);
      }

      this.extractionCount += 1;

      // Clear buffer after successful extraction
      this.turnBuffer = [];
    } catch {
      // Graceful degradation — extraction failure doesn't crash middleware
      // Buffer is preserved for the next trigger opportunity
    }
  }

  private async storeMemories(memories: readonly ExtractedMemory[]): Promise<void> {
    try {
      const entries = memories.map((m) => ({
        content: m.content,
        scope: this.config.scope as "agent" | "user" | "zone" | "global" | "session",
        memory_type: m.category,
        importance: m.confidence,
      }));

      await this.config.nexusClient.memory.batchStore({ memories: entries });
      this.memoriesStored += memories.length;
    } catch {
      // Graceful degradation — storage failure logged but doesn't throw
    }
  }
}

/**
 * Factory function for DistillationMiddleware.
 */
export function createDistillationMiddleware(config: DistillationConfig): DistillationMiddleware {
  return new DistillationMiddleware(config);
}
