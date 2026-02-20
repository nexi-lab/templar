import type { MemoryEntry, NexusClient, StoreMemoryParams } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { MemoryConfigurationError } from "@templar/errors";
import { safeNexusCall, withTimeout } from "../utils.js";
import { SimpleFactExtractor } from "./simple-extractor.js";
import {
  type AutoSaveConfig,
  DEFAULT_AUTO_SAVE_CONFIG,
  DEFAULT_CONFIG,
  type ExtractedFact,
  type FactExtractor,
  type FactTurnSummary,
  type NexusMemoryConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Content hashing for in-session deduplication
// ---------------------------------------------------------------------------

/** DJB2 hash — fast, deterministic, no crypto dependency */
function contentHash(content: string): number {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Resolved autoSave config
// ---------------------------------------------------------------------------

type ResolvedAutoSaveConfig = Required<AutoSaveConfig>;

function resolveAutoSaveConfig(config?: AutoSaveConfig): ResolvedAutoSaveConfig {
  return {
    categories: config?.categories ?? DEFAULT_AUTO_SAVE_CONFIG.categories,
    useLlmExtraction: config?.useLlmExtraction ?? DEFAULT_AUTO_SAVE_CONFIG.useLlmExtraction,
    deduplication: config?.deduplication ?? DEFAULT_AUTO_SAVE_CONFIG.deduplication,
    extractionTimeoutMs:
      config?.extractionTimeoutMs ?? DEFAULT_AUTO_SAVE_CONFIG.extractionTimeoutMs,
    maxPendingMemories: config?.maxPendingMemories ?? DEFAULT_AUTO_SAVE_CONFIG.maxPendingMemories,
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * NexusMemoryMiddleware — integrates DeepAgents.js agents with Nexus Memory API
 * for persistent agent memory across sessions.
 *
 * Implements a 3-tier MemGPT-style memory hierarchy:
 * - Tier 0: Active context (in-session, managed by this middleware)
 * - Tier 1: Agent memory (persisted via Nexus Memory API)
 * - Tier 2: Archival VFS (future — out of scope for v1)
 *
 * Memory lifecycle:
 * 1. Session start → load relevant memories from API
 * 2. Before each turn → inject memories into context (based on strategy)
 * 3. After each turn → buffer turn, extract facts at intervals, dedup, flush
 * 4. Session end → extract remaining buffer, flush, store session distillation
 *
 * Supports pluggable fact extraction via FactExtractor interface:
 * - SimpleFactExtractor (default): heuristic, no LLM call
 * - LlmFactExtractor: LLM-based categorized extraction
 */
export class NexusMemoryMiddleware implements TemplarMiddleware {
  readonly name = "nexus-memory";

  private readonly client: NexusClient;
  private readonly config: Omit<Required<NexusMemoryConfig>, "autoSave">;
  private readonly autoSaveConfig: ResolvedAutoSaveConfig;
  private readonly extractor: FactExtractor;

  // State — reassigned (not mutated) on updates
  private turnCount = 0;
  private pendingMemories: readonly StoreMemoryParams[] = [];
  private sessionMemories: readonly MemoryEntry[] = [];
  private turnBuffer: readonly FactTurnSummary[] = [];
  private seenContentHashes: Set<number> = new Set();
  private isExtracting = false;

  constructor(client: NexusClient, config: NexusMemoryConfig, extractor?: FactExtractor) {
    this.client = client;
    this.config = {
      scope: config.scope,
      autoSaveInterval: config.autoSaveInterval ?? DEFAULT_CONFIG.autoSaveInterval,
      maxMemoriesPerQuery: config.maxMemoriesPerQuery ?? DEFAULT_CONFIG.maxMemoriesPerQuery,
      injectionStrategy: config.injectionStrategy ?? DEFAULT_CONFIG.injectionStrategy,
      sessionStartTimeoutMs: config.sessionStartTimeoutMs ?? DEFAULT_CONFIG.sessionStartTimeoutMs,
      distillationTimeoutMs: config.distillationTimeoutMs ?? DEFAULT_CONFIG.distillationTimeoutMs,
      namespace: config.namespace ?? "",
    };
    this.autoSaveConfig = resolveAutoSaveConfig(config.autoSave);
    this.extractor = extractor ?? new SimpleFactExtractor();
  }

  /**
   * Load relevant memories from the API on session start.
   * Times out gracefully — session continues with empty memories if API is slow.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    const queryParams = {
      scope: this.config.scope,
      limit: this.config.maxMemoriesPerQuery,
      ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
    };

    try {
      const result = await withTimeout(
        this.client.memory.query(queryParams),
        this.config.sessionStartTimeoutMs,
      );

      if (result !== undefined) {
        this.sessionMemories = result.results;
      } else {
        // Timeout — log and continue with empty memories
        console.warn(
          `[nexus-memory] Session ${context.sessionId}: memory query timed out after ${this.config.sessionStartTimeoutMs}ms, continuing without memories`,
        );
        this.sessionMemories = [];
      }
    } catch (error) {
      // API error — degrade gracefully
      console.warn(
        `[nexus-memory] Session ${context.sessionId}: failed to load memories:`,
        error instanceof Error ? error.message : String(error),
      );
      this.sessionMemories = [];
    }

    this.turnCount = 0;
    this.pendingMemories = [];
    this.turnBuffer = [];
    this.seenContentHashes = new Set();
    this.isExtracting = false;
  }

  /**
   * Inject session memories into turn context (based on injection strategy).
   */
  async onBeforeTurn(context: TurnContext): Promise<void> {
    if (this.config.injectionStrategy === "on_demand") {
      return;
    }

    if (this.config.injectionStrategy === "every_turn") {
      // Re-query memories for fresh context
      try {
        const queryParams = {
          scope: this.config.scope,
          limit: this.config.maxMemoriesPerQuery,
          ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
        };

        const result = await withTimeout(
          this.client.memory.query(queryParams),
          this.config.sessionStartTimeoutMs,
        );

        if (result !== undefined) {
          this.sessionMemories = result.results;
        }
      } catch {
        // Silently continue with existing memories
      }
    }

    // Inject memories into turn metadata
    if (this.sessionMemories.length > 0) {
      const metadata = context.metadata ?? {};
      context.metadata = {
        ...metadata,
        memories: this.sessionMemories,
      };
    }
  }

  /**
   * Buffer turn summary, extract facts at intervals, and periodically flush.
   */
  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Buffer turn summary
    const summary: FactTurnSummary = {
      turnNumber: context.turnNumber,
      input:
        typeof context.input === "string" ? context.input : JSON.stringify(context.input ?? ""),
      output:
        typeof context.output === "string" ? context.output : JSON.stringify(context.output ?? ""),
      timestamp: new Date().toISOString(),
    };
    this.turnBuffer = [...this.turnBuffer, summary];

    // Extract and flush at interval
    if (this.turnCount % this.config.autoSaveInterval === 0) {
      await this.extractBufferedTurns(context.sessionId);

      if (this.pendingMemories.length > 0) {
        await this.flushPendingMemories(context.sessionId);
      }
    }
  }

  /**
   * Flush remaining buffer and store session distillation summary.
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    // Extract remaining buffered turns (await, not fire-and-forget)
    if (this.turnBuffer.length > 0) {
      await this.extractBufferedTurns(context.sessionId);
    }

    // Flush remaining pending memories
    if (this.pendingMemories.length > 0) {
      await this.flushPendingMemories(context.sessionId);
    }

    // Store session distillation (best-effort with timeout)
    const distillation: StoreMemoryParams = {
      content: `Session ${context.sessionId} completed with ${this.turnCount} turns.`,
      scope: this.config.scope,
      memory_type: "experience",
      importance: 0.7,
      ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
      metadata: {
        session_id: context.sessionId,
        turn_count: this.turnCount,
        type: "session_distillation",
      },
    };

    await safeNexusCall(() => this.client.memory.store(distillation), {
      timeout: this.config.distillationTimeoutMs,
      fallback: undefined,
      label: `nexus-memory:${context.sessionId}:distillation`,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract facts from buffered turns via the pluggable extractor.
   * Deduplicates, converts to StoreMemoryParams, and appends to pendingMemories.
   * Guarded against concurrent execution via isExtracting flag.
   */
  private async extractBufferedTurns(sessionId: string): Promise<void> {
    if (this.turnBuffer.length === 0 || this.isExtracting) {
      return;
    }

    this.isExtracting = true;
    const turnsToProcess = [...this.turnBuffer];
    this.turnBuffer = [];

    try {
      let extractedFacts: readonly ExtractedFact[];
      try {
        extractedFacts = await safeNexusCall(
          () => this.extractor.extract(turnsToProcess, { sessionId }),
          {
            timeout: this.autoSaveConfig.extractionTimeoutMs,
            fallback: [] as readonly ExtractedFact[],
            label: `nexus-memory:${sessionId}:extract`,
          },
        );
      } catch {
        extractedFacts = [];
      }

      if (extractedFacts.length === 0) {
        return;
      }

      // Deduplicate via in-session content hash
      const deduped = this.deduplicateFacts(extractedFacts);
      if (deduped.length === 0) {
        return;
      }

      // Convert ExtractedFact → StoreMemoryParams
      const namespace = this.config.namespace !== "" ? this.config.namespace : undefined;
      const newMemories: StoreMemoryParams[] = deduped.map((fact) => ({
        content: fact.content,
        scope: this.config.scope,
        memory_type: fact.category,
        importance: fact.importance,
        ...(namespace !== undefined ? { namespace } : {}),
        ...(fact.pathKey !== undefined ? { path_key: fact.pathKey } : {}),
      }));

      // Append to pending, cap at maxPendingMemories
      const combined = [...this.pendingMemories, ...newMemories];
      const max = this.autoSaveConfig.maxPendingMemories;
      this.pendingMemories = combined.length > max ? combined.slice(-max) : combined;
    } finally {
      this.isExtracting = false;
    }
  }

  /**
   * Filter out facts already seen in this session via content hash.
   * Reassigns the hash set (immutable pattern — no in-place mutation).
   */
  private deduplicateFacts(facts: readonly ExtractedFact[]): readonly ExtractedFact[] {
    if (!this.autoSaveConfig.deduplication) {
      return facts;
    }

    const result: ExtractedFact[] = [];
    const newHashes = new Set(this.seenContentHashes);
    for (const fact of facts) {
      const hash = contentHash(fact.content);
      if (newHashes.has(hash)) {
        continue;
      }
      newHashes.add(hash);
      result.push(fact);
    }
    this.seenContentHashes = newHashes;
    return result;
  }

  /**
   * Flush the pending memories buffer via batch store.
   * On failure, keeps the buffer for the next flush attempt (Decision 12A).
   */
  private async flushPendingMemories(sessionId: string): Promise<void> {
    const toFlush = [...this.pendingMemories];

    try {
      await this.client.memory.batchStore({ memories: toFlush });
      // Clear buffer on success
      this.pendingMemories = [];
    } catch (error) {
      // Keep buffer for retry on next flush (Decision 12A)
      console.warn(
        `[nexus-memory] Session ${sessionId}: batch store failed, ${toFlush.length} memories retained for retry:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * Validate NexusMemoryConfig
 * @throws {MemoryConfigurationError} if config is invalid
 */
export function validateMemoryConfig(config: NexusMemoryConfig): void {
  const validScopes = ["agent", "user", "zone", "global", "session"];
  if (!validScopes.includes(config.scope)) {
    throw new MemoryConfigurationError(
      `Invalid scope: "${config.scope}". Must be one of: ${validScopes.join(", ")}`,
    );
  }

  if (config.autoSaveInterval !== undefined && config.autoSaveInterval < 1) {
    throw new MemoryConfigurationError(
      `autoSaveInterval must be >= 1, got ${config.autoSaveInterval}`,
    );
  }

  if (config.maxMemoriesPerQuery !== undefined && config.maxMemoriesPerQuery < 1) {
    throw new MemoryConfigurationError(
      `maxMemoriesPerQuery must be >= 1, got ${config.maxMemoriesPerQuery}`,
    );
  }

  const validStrategies = ["session_start", "every_turn", "on_demand"];
  if (
    config.injectionStrategy !== undefined &&
    !validStrategies.includes(config.injectionStrategy)
  ) {
    throw new MemoryConfigurationError(
      `Invalid injectionStrategy: "${config.injectionStrategy}". Must be one of: ${validStrategies.join(", ")}`,
    );
  }

  if (config.sessionStartTimeoutMs !== undefined && config.sessionStartTimeoutMs < 0) {
    throw new MemoryConfigurationError(
      `sessionStartTimeoutMs must be >= 0, got ${config.sessionStartTimeoutMs}`,
    );
  }

  if (config.distillationTimeoutMs !== undefined && config.distillationTimeoutMs < 0) {
    throw new MemoryConfigurationError(
      `distillationTimeoutMs must be >= 0, got ${config.distillationTimeoutMs}`,
    );
  }

  // Validate autoSave config
  if (config.autoSave !== undefined) {
    const as = config.autoSave;

    if (
      as.extractionTimeoutMs !== undefined &&
      (!Number.isFinite(as.extractionTimeoutMs) || as.extractionTimeoutMs < 0)
    ) {
      throw new MemoryConfigurationError(
        `autoSave.extractionTimeoutMs must be >= 0, got ${as.extractionTimeoutMs}`,
      );
    }

    if (
      as.maxPendingMemories !== undefined &&
      (!Number.isFinite(as.maxPendingMemories) || as.maxPendingMemories < 1)
    ) {
      throw new MemoryConfigurationError(
        `autoSave.maxPendingMemories must be >= 1, got ${as.maxPendingMemories}`,
      );
    }
  }
}
