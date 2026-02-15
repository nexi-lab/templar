import type { NexusClient, StoreMemoryParams } from "@nexus/sdk";
import { ExternalError, ValidationError } from "@templar/errors";
import type { EntityExtractor } from "./extractor.js";
import { NexusEntityExtractor } from "./extractor.js";
import { toEntity, toRelationship } from "./mapping.js";
import {
  DEFAULT_ENTITY_CONFIG,
  type Entity,
  type EntityMemoryConfig,
  type EntitySearchOpts,
  type EntityType,
  type Relationship,
  type RelationshipQueryOpts,
  type TrackEntityParams,
  VALID_SCOPES,
} from "./types.js";

// ============================================================================
// CONFIG VALIDATION
// ============================================================================
const VALID_ENTITY_TYPES: readonly EntityType[] = [
  "person",
  "organization",
  "project",
  "concept",
  "location",
  "custom",
];

/**
 * Validate EntityMemoryConfig.
 *
 * @throws {ValidationError} with code ENTITY_CONFIGURATION_INVALID
 */
export function validateEntityMemoryConfig(config: EntityMemoryConfig): void {
  if (!VALID_SCOPES.includes(config.scope as (typeof VALID_SCOPES)[number])) {
    throw new ValidationError({
      code: "ENTITY_CONFIGURATION_INVALID",
      message: `Invalid scope: "${config.scope}". Must be one of: ${VALID_SCOPES.join(", ")}`,
    });
  }

  if (config.maxEntitiesPerQuery !== undefined && config.maxEntitiesPerQuery < 1) {
    throw new ValidationError({
      code: "ENTITY_CONFIGURATION_INVALID",
      message: `maxEntitiesPerQuery must be >= 1, got ${config.maxEntitiesPerQuery}`,
    });
  }

  if (config.autoSaveInterval !== undefined && config.autoSaveInterval < 1) {
    throw new ValidationError({
      code: "ENTITY_CONFIGURATION_INVALID",
      message: `autoSaveInterval must be >= 1, got ${config.autoSaveInterval}`,
    });
  }

  if (config.sessionStartTimeoutMs !== undefined && config.sessionStartTimeoutMs < 0) {
    throw new ValidationError({
      code: "ENTITY_CONFIGURATION_INVALID",
      message: `sessionStartTimeoutMs must be >= 0, got ${config.sessionStartTimeoutMs}`,
    });
  }

  if (config.entityTypes !== undefined) {
    for (const et of config.entityTypes) {
      if (!VALID_ENTITY_TYPES.includes(et)) {
        throw new ValidationError({
          code: "ENTITY_CONFIGURATION_INVALID",
          message: `Invalid entity type: "${et}". Must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
        });
      }
    }
  }
}

// ============================================================================
// RESOLVED CONFIG
// ============================================================================

interface ResolvedConfig {
  readonly scope: EntityMemoryConfig["scope"];
  readonly maxEntitiesPerQuery: number;
  readonly autoSaveInterval: number;
  readonly sessionStartTimeoutMs: number;
  readonly namespace: string;
  readonly entityTypes: readonly EntityType[] | undefined;
}

function resolveConfig(config: EntityMemoryConfig): ResolvedConfig {
  return {
    scope: config.scope,
    maxEntitiesPerQuery: config.maxEntitiesPerQuery ?? DEFAULT_ENTITY_CONFIG.maxEntitiesPerQuery,
    autoSaveInterval: config.autoSaveInterval ?? DEFAULT_ENTITY_CONFIG.autoSaveInterval,
    sessionStartTimeoutMs:
      config.sessionStartTimeoutMs ?? DEFAULT_ENTITY_CONFIG.sessionStartTimeoutMs,
    namespace: config.namespace ?? "",
    entityTypes: config.entityTypes,
  };
}

// ============================================================================
// ENTITY MEMORY
// ============================================================================

/**
 * EntityMemory — relationship graph tracking backed by Nexus Memory API.
 *
 * Provides typed CRUD operations for entities and their relationships.
 * Uses the Nexus Memory API with `store_to_graph`, `extract_entities`,
 * and `extract_relationships` flags for server-side graph storage.
 */
export class EntityMemory {
  private readonly client: NexusClient;
  private readonly config: ResolvedConfig;
  private readonly extractor: EntityExtractor;

  constructor(client: NexusClient, config: EntityMemoryConfig, extractor?: EntityExtractor) {
    validateEntityMemoryConfig(config);
    this.client = client;
    this.config = resolveConfig(config);
    this.extractor = extractor ?? new NexusEntityExtractor();
  }

  /**
   * Track an entity and optionally establish relationships.
   *
   * Creates or updates the entity in Nexus Memory with graph storage.
   * If relationships are specified, they are stored as separate memory
   * entries with `store_to_graph: true`.
   *
   * @throws {ExternalError} with code ENTITY_TRACK_FAILED on API error
   */
  async track(params: TrackEntityParams): Promise<Entity> {
    const now = new Date().toISOString();

    try {
      // Store the entity
      const entityStoreParams: StoreMemoryParams = {
        content: {
          name: params.entity,
          type: params.type,
          entityType: params.type,
          attributes: params.attributes ?? {},
          firstSeen: now,
          lastSeen: now,
          sourceMemoryIds: [],
        },
        scope: this.config.scope,
        memory_type: "entity",
        importance: 0.7,
        extract_entities: true,
        store_to_graph: true,
        ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
        path_key: `entity:${params.entity}:${params.type}`,
      };

      const storeResult = await this.client.memory.store(entityStoreParams);

      // Store relationships if provided
      if (params.relationships !== undefined && params.relationships.length > 0) {
        const relationshipMemories: StoreMemoryParams[] = params.relationships.map((rel) => ({
          content: {
            sourceEntityId: storeResult.memory_id,
            targetEntityId: `pending:${rel.target}`,
            relationType: rel.type,
            type: rel.type,
            weight: rel.weight ?? 1.0,
            validFrom: now,
            validUntil: null,
            sourceMemoryIds: [storeResult.memory_id],
          },
          scope: this.config.scope,
          memory_type: "relationship",
          importance: 0.6,
          extract_entities: true,
          extract_relationships: true,
          store_to_graph: true,
          ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
          path_key: `rel:${params.entity}:${rel.type}:${rel.target}`,
        }));

        await this.client.memory.batchStore({ memories: relationshipMemories });
      }

      return {
        id: storeResult.memory_id,
        name: params.entity,
        entityType: params.type,
        attributes: params.attributes ?? {},
        firstSeen: now,
        lastSeen: now,
        sourceMemoryIds: [],
      };
    } catch (error) {
      throw new ExternalError({
        code: "ENTITY_TRACK_FAILED",
        message: `Failed to track entity '${params.entity}': ${error instanceof Error ? error.message : String(error)}`,
        ...(error instanceof Error ? { cause: error } : {}),
      });
    }
  }

  /**
   * Get an entity by its ID.
   *
   * @returns The entity or undefined if not found
   */
  async getEntity(id: string): Promise<Entity | undefined> {
    try {
      const result = await this.client.memory.get(id);
      return toEntity(result.memory);
    } catch {
      return undefined;
    }
  }

  /**
   * Get an entity by name and optional type.
   *
   * Uses path_key-based query for efficient lookup.
   *
   * @returns The entity or undefined if not found
   */
  async getEntityByName(name: string, type?: EntityType): Promise<Entity | undefined> {
    const queryParams = {
      scope: this.config.scope,
      memory_type: "entity",
      limit: 1,
      ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
      ...(type !== undefined ? { entity_type: type } : {}),
      person: name,
    };

    try {
      const result = await this.client.memory.query(queryParams);
      if (result.results.length === 0) return undefined;

      const entry = result.results[0];
      if (entry === undefined) return undefined;
      return toEntity(entry);
    } catch {
      return undefined;
    }
  }

  /**
   * Get relationships for an entity.
   *
   * @remarks Results are filtered client-side after fetching from Nexus.
   * When there are many relationships in the scope but only some belong
   * to this entity, results may be incomplete. Consider increasing
   * `maxEntitiesPerQuery` for denser graphs.
   *
   * @param entityId - The entity ID to query relationships for
   * @param opts - Optional filters for relationship type, validity, and limit
   * @returns Array of relationships
   */
  async getRelationships(
    entityId: string,
    opts?: RelationshipQueryOpts,
  ): Promise<readonly Relationship[]> {
    const queryParams = {
      scope: this.config.scope,
      memory_type: "relationship",
      limit: opts?.limit ?? this.config.maxEntitiesPerQuery,
      ...(this.config.namespace !== "" ? { namespace: this.config.namespace } : {}),
    };

    try {
      const result = await this.client.memory.query(queryParams);

      const relationships: Relationship[] = [];
      for (const entry of result.results) {
        const rel = toRelationship(entry);
        if (rel === undefined) continue;

        // Filter by entity ID (source or target)
        if (rel.sourceEntityId !== entityId && rel.targetEntityId !== entityId) {
          continue;
        }

        // Filter by relationship type
        if (opts?.relationType !== undefined && rel.relationType !== opts.relationType) {
          continue;
        }

        // Filter by validity (default: only valid relationships)
        const validOnly = opts?.validOnly ?? true;
        if (validOnly && rel.validUntil !== null) {
          continue;
        }

        relationships.push(rel);
      }

      return relationships;
    } catch {
      return [];
    }
  }

  /**
   * Search entities by semantic query.
   *
   * Uses Nexus Memory search API with hybrid mode for best results.
   *
   * @param query - Search query string
   * @param opts - Optional filters
   * @returns Array of matching entities
   */
  async searchEntities(query: string, opts?: EntitySearchOpts): Promise<readonly Entity[]> {
    const searchParams = {
      query,
      scope: opts?.scope ?? this.config.scope,
      memory_type: "entity",
      limit: opts?.limit ?? this.config.maxEntitiesPerQuery,
      search_mode: "hybrid" as const,
      ...(opts?.entityType !== undefined ? { entity_type: opts.entityType } : {}),
    };

    try {
      const result = await this.client.memory.search(searchParams);

      const entities: Entity[] = [];
      for (const entry of result.results) {
        const entity = toEntity(entry);
        if (entity !== undefined) {
          entities.push(entity);
        }
      }

      return entities;
    } catch {
      return [];
    }
  }

  /**
   * Access the configured extractor.
   * Useful for middleware or custom extraction pipelines.
   */
  getExtractor(): EntityExtractor {
    return this.extractor;
  }

  /**
   * Access the resolved config.
   */
  getConfig(): ResolvedConfig {
    return this.config;
  }
}
