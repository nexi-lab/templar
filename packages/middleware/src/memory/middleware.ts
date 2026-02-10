import type { MemoryEntry, MemoryScope, NexusClient, StoreMemoryParams } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { MemoryConfigurationError } from "@templar/errors";
import { withTimeout } from "../utils.js";
import { DEFAULT_CONFIG, type NexusMemoryConfig } from "./types.js";

/**
 * Extract key facts from turn output using simple heuristics.
 * This is a v1 implementation — no LLM-based extraction.
 */
function extractFacts(
  output: unknown,
  scope: MemoryScope,
  namespace: string | undefined,
): StoreMemoryParams[] {
  if (output === null || output === undefined) {
    return [];
  }

  const text = typeof output === "string" ? output : JSON.stringify(output);

  // Skip very short outputs (likely acknowledgements)
  if (text.length < 20) {
    return [];
  }

  return [
    {
      content: text,
      scope,
      memory_type: "experience",
      importance: 0.5,
      ...(namespace !== undefined ? { namespace } : {}),
    },
  ];
}

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
 * 3. After each turn → extract facts, buffer, periodically flush
 * 4. Session end → flush remaining buffer + store session distillation
 */
export class NexusMemoryMiddleware implements TemplarMiddleware {
  readonly name = "nexus-memory";

  private readonly client: NexusClient;
  private readonly config: Required<NexusMemoryConfig>;

  // State — reassigned (not mutated) on updates
  private turnCount = 0;
  private pendingMemories: readonly StoreMemoryParams[] = [];
  private sessionMemories: readonly MemoryEntry[] = [];

  constructor(client: NexusClient, config: NexusMemoryConfig) {
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
   * Extract facts from turn output, buffer, and periodically flush.
   */
  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Extract key facts from output
    const facts = extractFacts(
      context.output,
      this.config.scope,
      this.config.namespace !== "" ? this.config.namespace : undefined,
    );

    if (facts.length > 0) {
      this.pendingMemories = [...this.pendingMemories, ...facts];
    }

    // Flush on interval
    if (this.turnCount % this.config.autoSaveInterval === 0 && this.pendingMemories.length > 0) {
      await this.flushPendingMemories(context.sessionId);
    }
  }

  /**
   * Flush remaining buffer and store session distillation summary.
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    // Flush remaining pending memories
    if (this.pendingMemories.length > 0) {
      await this.flushPendingMemories(context.sessionId);
    }

    // Store session distillation (best-effort with timeout)
    try {
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

      await withTimeout(this.client.memory.store(distillation), this.config.distillationTimeoutMs);
    } catch (error) {
      console.warn(
        `[nexus-memory] Session ${context.sessionId}: failed to store distillation:`,
        error instanceof Error ? error.message : String(error),
      );
    }
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
}
