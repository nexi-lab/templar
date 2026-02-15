import type { NexusClient, StoreMemoryParams } from "@nexus/sdk";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { withTimeout } from "@templar/middleware/utils";
import { validateEntityMemoryConfig } from "./entity-memory.js";
import type { EntityExtractor } from "./extractor.js";
import { NexusEntityExtractor } from "./extractor.js";
import { toEntity } from "./mapping.js";
import { DEFAULT_ENTITY_CONFIG, type Entity, type EntityMemoryConfig } from "./types.js";

// ============================================================================
// ENTITY MEMORY MIDDLEWARE
// ============================================================================

/**
 * EntityMemoryMiddleware — TemplarMiddleware that automatically
 * extracts entities from conversation turns and tracks them
 * in the Nexus Memory knowledge graph.
 *
 * Follows the same buffer+flush pattern as NexusMemoryMiddleware:
 * - Session start: load relevant entities for context injection
 * - After turn: buffer extracted entities
 * - Flush on interval or session end
 *
 * Can be used alongside NexusMemoryMiddleware without interference.
 */
export class EntityMemoryMiddleware implements TemplarMiddleware {
  readonly name = "entity-memory";

  private readonly client: NexusClient;
  private readonly config: {
    readonly scope: EntityMemoryConfig["scope"];
    readonly maxEntitiesPerQuery: number;
    readonly autoSaveInterval: number;
    readonly sessionStartTimeoutMs: number;
    readonly namespace: string;
  };
  private readonly extractor: EntityExtractor;

  // State — reassigned (not mutated) on updates
  private turnCount = 0;
  private pendingStoreParams: readonly StoreMemoryParams[] = [];
  private sessionEntities: readonly Entity[] = [];

  constructor(client: NexusClient, config: EntityMemoryConfig, extractor?: EntityExtractor) {
    validateEntityMemoryConfig(config);
    this.client = client;
    this.config = {
      scope: config.scope,
      maxEntitiesPerQuery: config.maxEntitiesPerQuery ?? DEFAULT_ENTITY_CONFIG.maxEntitiesPerQuery,
      autoSaveInterval: config.autoSaveInterval ?? DEFAULT_ENTITY_CONFIG.autoSaveInterval,
      sessionStartTimeoutMs:
        config.sessionStartTimeoutMs ?? DEFAULT_ENTITY_CONFIG.sessionStartTimeoutMs,
      namespace: config.namespace ?? "",
    };
    this.extractor = extractor ?? new NexusEntityExtractor();
  }

  /**
   * Load relevant entities from Nexus on session start.
   * Times out gracefully — session continues without entity context if slow.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    const queryParams = {
      scope: this.config.scope,
      memory_type: "entity",
      limit: this.config.maxEntitiesPerQuery,
      ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
    };

    try {
      const result = await withTimeout(
        this.client.memory.query(queryParams),
        this.config.sessionStartTimeoutMs,
      );

      if (result !== undefined) {
        const entities: Entity[] = [];
        for (const entry of result.results) {
          const entity = toEntity(entry);
          if (entity !== undefined) {
            entities.push(entity);
          }
        }
        this.sessionEntities = entities;
      } else {
        console.warn(
          `[entity-memory] Session ${context.sessionId}: entity query timed out after ${this.config.sessionStartTimeoutMs}ms, continuing without entity context`,
        );
        this.sessionEntities = [];
      }
    } catch (error) {
      console.warn(
        `[entity-memory] Session ${context.sessionId}: failed to load entities:`,
        error instanceof Error ? error.message : String(error),
      );
      this.sessionEntities = [];
    }

    this.turnCount = 0;
    this.pendingStoreParams = [];
  }

  /**
   * Inject entity context into turn metadata.
   */
  async onBeforeTurn(context: TurnContext): Promise<void> {
    if (this.sessionEntities.length > 0) {
      const metadata = context.metadata ?? {};
      context.metadata = {
        ...metadata,
        entities: this.sessionEntities,
      };
    }
  }

  /**
   * Extract entities from turn output, buffer for periodic flush.
   */
  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Extract entity-related store params from turn output
    const storeParams = this.extractStoreParams(context.output);
    if (storeParams.length > 0) {
      this.pendingStoreParams = [...this.pendingStoreParams, ...storeParams];
    }

    // Flush on interval
    if (this.turnCount % this.config.autoSaveInterval === 0 && this.pendingStoreParams.length > 0) {
      await this.flushPending(context.sessionId);
    }
  }

  /**
   * Flush remaining buffer on session end.
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    if (this.pendingStoreParams.length > 0) {
      await this.flushPending(context.sessionId);
    }
  }

  /**
   * Access the current session entities (for testing/inspection).
   */
  getSessionEntities(): readonly Entity[] {
    return this.sessionEntities;
  }

  /**
   * Access the pending store params (for testing/inspection).
   */
  getPendingCount(): number {
    return this.pendingStoreParams.length;
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  /**
   * Extract store params from turn output.
   * Uses NexusEntityExtractor's buildStoreParams if available,
   * otherwise creates a basic entity store param.
   */
  private extractStoreParams(output: unknown): StoreMemoryParams[] {
    if (output === null || output === undefined) return [];

    const text = typeof output === "string" ? output : JSON.stringify(output);

    // Skip very short outputs (likely acknowledgements)
    if (text.length < 20) return [];

    if (this.extractor instanceof NexusEntityExtractor) {
      return [
        this.extractor.buildStoreParams(
          text,
          this.config.scope,
          this.config.namespace !== "" ? this.config.namespace : undefined,
        ),
      ];
    }

    // For custom extractors, create a basic store param with extraction flags
    return [
      {
        content: text,
        scope: this.config.scope,
        memory_type: "entity",
        importance: 0.7,
        extract_entities: true,
        extract_relationships: true,
        store_to_graph: true,
        ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
      },
    ];
  }

  /**
   * Flush pending store params via batch store.
   * On failure, retains buffer for next attempt.
   */
  private async flushPending(sessionId: string): Promise<void> {
    const toFlush = [...this.pendingStoreParams];

    try {
      await this.client.memory.batchStore({ memories: toFlush });
      this.pendingStoreParams = [];
    } catch (error) {
      console.warn(
        `[entity-memory] Session ${sessionId}: batch store failed, ${toFlush.length} items retained for retry:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
