/**
 * @templar/entity-memory
 *
 * Relationship graph tracking for AI agents via the Nexus Memory API.
 *
 * Provides typed CRUD operations for entities and their relationships,
 * with a pluggable extraction interface and TemplarMiddleware integration.
 *
 * @example
 * ```typescript
 * import { EntityMemory, EntityMemoryMiddleware } from "@templar/entity-memory";
 *
 * // Direct API usage
 * const entityMemory = new EntityMemory(nexusClient, { scope: "agent" });
 * await entityMemory.track({
 *   entity: "Alice",
 *   type: "person",
 *   relationships: [
 *     { target: "Acme Corp", type: "works_at" },
 *     { target: "Bob", type: "manages" },
 *   ],
 * });
 *
 * // As middleware (auto-extracts entities from turns)
 * const middleware = new EntityMemoryMiddleware(nexusClient, { scope: "agent" });
 * agent.use(middleware);
 * ```
 */

// ============================================================================
// CORE
// ============================================================================

export { EntityMemory, validateEntityMemoryConfig } from "./entity-memory.js";
export { EntityMemoryMiddleware } from "./middleware.js";

// ============================================================================
// EXTRACTORS
// ============================================================================

export type { EntityExtractor } from "./extractor.js";
export { MockEntityExtractor, NexusEntityExtractor } from "./extractor.js";

// ============================================================================
// MAPPING
// ============================================================================

export { fromEntity, fromRelationship, toEntity, toRelationship } from "./mapping.js";

// ============================================================================
// TYPES
// ============================================================================

export type {
  Entity,
  EntityMemoryConfig,
  EntitySearchOpts,
  EntityType,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionResult,
  Relationship,
  RelationshipQueryOpts,
  TrackEntityParams,
  TrackRelationshipParams,
} from "./types.js";
export { DEFAULT_ENTITY_CONFIG, VALID_SCOPES } from "./types.js";

// ============================================================================
// FACTORY
// ============================================================================

import type { NexusClient } from "@nexus/sdk";
import { EntityMemory } from "./entity-memory.js";
import type { EntityExtractor } from "./extractor.js";
import type { EntityMemoryConfig } from "./types.js";

/**
 * Create an EntityMemory instance with validated config.
 */
export function createEntityMemory(
  client: NexusClient,
  config: EntityMemoryConfig,
  extractor?: EntityExtractor,
): EntityMemory {
  return new EntityMemory(client, config, extractor);
}

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/entity-memory" as const;
export const PACKAGE_VERSION = "0.0.0" as const;
