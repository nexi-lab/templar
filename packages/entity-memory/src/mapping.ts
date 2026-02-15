import type { MemoryEntry } from "@nexus/sdk";
import type { Entity, Relationship } from "./types.js";

// ============================================================================
// MEMORY ENTRY → ENTITY MAPPING
// ============================================================================

/**
 * Map a Nexus MemoryEntry to a strongly-typed Entity.
 *
 * Expects the memory entry to have structured content with
 * entity fields. Falls back to sensible defaults for missing fields.
 *
 * @param entry - Raw Nexus MemoryEntry
 * @returns Typed Entity or undefined if entry is not an entity
 */
export function toEntity(entry: MemoryEntry): Entity | undefined {
  const content = parseContent(entry.content);
  if (content === undefined) return undefined;

  const name = asString(content.name);
  const entityType = asString(content.type) ?? asString(content.entityType);
  if (name === undefined || entityType === undefined) return undefined;

  const validEntityTypes = ["person", "organization", "project", "concept", "location", "custom"];
  const normalizedType = validEntityTypes.includes(entityType) ? entityType : "custom";

  const attributes = isRecord(content.attributes) ? content.attributes : {};
  const sourceMemoryIds = asStringArray(content.sourceMemoryIds) ?? [];

  return {
    id: entry.memory_id,
    name,
    entityType: normalizedType as Entity["entityType"],
    attributes,
    firstSeen: entry.created_at ?? new Date().toISOString(),
    lastSeen: entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
    sourceMemoryIds,
  };
}

/**
 * Map a Nexus MemoryEntry to a strongly-typed Relationship.
 *
 * @param entry - Raw Nexus MemoryEntry
 * @returns Typed Relationship or undefined if entry is not a relationship
 */
export function toRelationship(entry: MemoryEntry): Relationship | undefined {
  const content = parseContent(entry.content);
  if (content === undefined) return undefined;

  const sourceEntityId = asString(content.sourceEntityId);
  const targetEntityId = asString(content.targetEntityId);
  const relationType = asString(content.relationType) ?? asString(content.type);
  if (sourceEntityId === undefined || targetEntityId === undefined || relationType === undefined) {
    return undefined;
  }

  const weight = asNumber(content.weight) ?? 1.0;
  const validFrom = asString(content.validFrom) ?? entry.created_at ?? new Date().toISOString();
  const validUntil = asString(content.validUntil) ?? null;
  const sourceMemoryIds = asStringArray(content.sourceMemoryIds) ?? [];

  return {
    id: entry.memory_id,
    sourceEntityId,
    targetEntityId,
    relationType,
    weight: Math.max(0, Math.min(1, weight)),
    validFrom,
    validUntil,
    sourceMemoryIds,
  };
}

/**
 * Build a MemoryEntry-compatible content object from an Entity.
 * Used when storing entities back to Nexus.
 */
export function fromEntity(entity: Omit<Entity, "id">): Record<string, unknown> {
  return {
    name: entity.name,
    type: entity.entityType,
    entityType: entity.entityType,
    attributes: entity.attributes,
    firstSeen: entity.firstSeen,
    lastSeen: entity.lastSeen,
    sourceMemoryIds: [...entity.sourceMemoryIds],
  };
}

/**
 * Build a MemoryEntry-compatible content object from a Relationship.
 */
export function fromRelationship(rel: Omit<Relationship, "id">): Record<string, unknown> {
  return {
    sourceEntityId: rel.sourceEntityId,
    targetEntityId: rel.targetEntityId,
    relationType: rel.relationType,
    type: rel.relationType,
    weight: rel.weight,
    validFrom: rel.validFrom,
    validUntil: rel.validUntil,
    sourceMemoryIds: [...rel.sourceMemoryIds],
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function parseContent(
  content: string | Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return content;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item): item is string => typeof item === "string")) return undefined;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
