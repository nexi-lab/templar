import type { MemoryScope } from "@nexus/sdk";

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Supported entity types for relationship tracking.
 *
 * Use string literals for type safety — custom types
 * are supported via the `custom` escape hatch.
 */
export type EntityType = "person" | "organization" | "project" | "concept" | "location" | "custom";

/**
 * A tracked entity node in the relationship graph.
 *
 * Entities are immutable value objects — updates produce
 * new instances rather than mutating existing ones.
 */
export interface Entity {
  /** Unique entity identifier (maps to Nexus memory_id) */
  readonly id: string;
  /** Canonical entity name */
  readonly name: string;
  /** Entity classification */
  readonly entityType: EntityType;
  /** Entity attributes (role, description, etc.) */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** When this entity was first observed (ISO-8601) */
  readonly firstSeen: string;
  /** When this entity was last referenced (ISO-8601) */
  readonly lastSeen: string;
  /** Memory IDs that mention this entity */
  readonly sourceMemoryIds: readonly string[];
}

/**
 * A directed relationship edge between two entities.
 *
 * Relationships carry temporal validity — a relationship
 * can be valid for a bounded time range (e.g., "worked at
 * Acme Corp from 2024 to 2025").
 */
export interface Relationship {
  /** Unique relationship identifier */
  readonly id: string;
  /** Source entity ID */
  readonly sourceEntityId: string;
  /** Target entity ID */
  readonly targetEntityId: string;
  /** Relationship classification (e.g., "works_at", "manages") */
  readonly relationType: string;
  /** Confidence weight (0-1) */
  readonly weight: number;
  /** When the relationship became valid (ISO-8601) */
  readonly validFrom: string;
  /** When the relationship became invalid (null = still valid) */
  readonly validUntil: string | null;
  /** Memory IDs that established this relationship */
  readonly sourceMemoryIds: readonly string[];
}

// ============================================================================
// INPUT PARAMS
// ============================================================================

/**
 * Parameters for tracking an entity and its relationships.
 *
 * This is the primary write operation — it creates or updates
 * an entity and optionally establishes relationships.
 */
export interface TrackEntityParams {
  /** Entity name (used for resolution against existing entities) */
  readonly entity: string;
  /** Entity type classification */
  readonly type: EntityType;
  /** Optional attributes */
  readonly attributes?: Readonly<Record<string, unknown>>;
  /** Relationships to establish from this entity */
  readonly relationships?: readonly TrackRelationshipParams[];
}

/**
 * Parameters for a single relationship in a track operation.
 */
export interface TrackRelationshipParams {
  /** Target entity name */
  readonly target: string;
  /** Target entity type (defaults to "custom" if not provided) */
  readonly targetType?: EntityType;
  /** Relationship type (e.g., "works_at", "manages") */
  readonly type: string;
  /** Confidence weight (0-1, defaults to 1.0) */
  readonly weight?: number;
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Options for querying relationships of an entity.
 */
export interface RelationshipQueryOpts {
  /** Filter by relationship type */
  readonly relationType?: string;
  /** Only include currently valid relationships (default: true) */
  readonly validOnly?: boolean;
  /** Maximum number of relationships to return */
  readonly limit?: number;
}

/**
 * Options for searching entities.
 */
export interface EntitySearchOpts {
  /** Filter by entity type */
  readonly entityType?: EntityType;
  /** Maximum results */
  readonly limit?: number;
  /** Memory scope filter */
  readonly scope?: MemoryScope;
}

// ============================================================================
// EXTRACTOR TYPES
// ============================================================================

/**
 * Result of entity extraction from text.
 */
export interface ExtractionResult {
  /** Extracted entities */
  readonly entities: readonly ExtractedEntity[];
  /** Extracted relationships between entities */
  readonly relationships: readonly ExtractedRelationship[];
}

/**
 * A single extracted entity (before resolution).
 */
export interface ExtractedEntity {
  /** Entity name as mentioned in text */
  readonly name: string;
  /** Inferred entity type */
  readonly type: EntityType;
  /** Optional attributes extracted from context */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * A single extracted relationship (before resolution).
 */
export interface ExtractedRelationship {
  /** Source entity name */
  readonly source: string;
  /** Target entity name */
  readonly target: string;
  /** Relationship type */
  readonly type: string;
  /** Confidence (0-1) */
  readonly weight?: number;
}

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Configuration for EntityMemory and its middleware.
 */
export interface EntityMemoryConfig {
  /** Memory scope for entity storage (required) */
  readonly scope: MemoryScope;
  /** Maximum entities to load per session query (default: 20) */
  readonly maxEntitiesPerQuery?: number;
  /** Flush pending entities every N turns (default: 5) */
  readonly autoSaveInterval?: number;
  /** Timeout for entity queries at session start in ms (default: 3000) */
  readonly sessionStartTimeoutMs?: number;
  /** Optional namespace prefix for entity memories */
  readonly namespace?: string;
  /** Entity types to track (default: all types) */
  readonly entityTypes?: readonly EntityType[];
}

/**
 * Default configuration values.
 */
export const DEFAULT_ENTITY_CONFIG = {
  maxEntitiesPerQuery: 20,
  autoSaveInterval: 5,
  sessionStartTimeoutMs: 3000,
} as const;

/**
 * Valid memory scopes accepted by the Nexus API.
 */
export const VALID_SCOPES = ["agent", "user", "zone", "global", "session"] as const;
