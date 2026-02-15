import type { StoreMemoryParams } from "@nexus/sdk";
import {
  type ExtractedEntity,
  type ExtractedRelationship,
  type ExtractionResult,
  VALID_SCOPES,
} from "./types.js";

// ============================================================================
// EXTRACTOR INTERFACE
// ============================================================================

/**
 * EntityExtractor — pluggable interface for extracting entities
 * and relationships from conversation text.
 *
 * Implementations can range from simple heuristics to LLM-based
 * structured output extraction.
 */
export interface EntityExtractor {
  /**
   * Extract entities and relationships from text content.
   *
   * @param content - Text to extract from (turn output, message, etc.)
   * @returns Extraction result with entities and relationships
   */
  extract(content: string): Promise<ExtractionResult>;
}

// ============================================================================
// NEXUS ENTITY EXTRACTOR
// ============================================================================

/**
 * NexusEntityExtractor — delegates entity extraction to the Nexus
 * Memory API by setting `extract_entities`, `extract_relationships`,
 * and `store_to_graph` flags on store requests.
 *
 * This is a "pass-through" extractor: it does not perform extraction
 * itself but prepares store params so Nexus handles it server-side.
 * For use with `EntityMemory.track()` and `EntityMemoryMiddleware`.
 */
export class NexusEntityExtractor implements EntityExtractor {
  /**
   * Returns an empty extraction result — actual extraction happens
   * server-side when store params include the extract flags.
   *
   * This method exists to satisfy the interface. The real value
   * of NexusEntityExtractor is in `buildStoreParams()` which
   * adds the extraction flags to store requests.
   */
  async extract(_content: string): Promise<ExtractionResult> {
    // Nexus handles extraction server-side — we return empty here
    // and rely on store flags to trigger extraction
    return { entities: [], relationships: [] };
  }

  /**
   * Build StoreMemoryParams with Nexus extraction flags enabled.
   *
   * @param content - Content to store
   * @param scope - Memory scope
   * @param namespace - Optional namespace
   * @returns Store params with extraction flags
   */
  buildStoreParams(
    content: string,
    scope: string,
    namespace: string | undefined,
  ): StoreMemoryParams {
    const params: StoreMemoryParams = {
      content,
      memory_type: "entity",
      importance: 0.7,
      extract_entities: true,
      extract_relationships: true,
      store_to_graph: true,
    };

    // Set scope if it's a valid MemoryScope value
    if (VALID_SCOPES.includes(scope as (typeof VALID_SCOPES)[number])) {
      return {
        ...params,
        scope: scope as "agent" | "user" | "zone" | "global" | "session",
        ...(namespace !== undefined ? { namespace } : {}),
      };
    }

    return {
      ...params,
      ...(namespace !== undefined ? { namespace } : {}),
    };
  }
}

// ============================================================================
// MOCK ENTITY EXTRACTOR (for testing)
// ============================================================================

/**
 * MockEntityExtractor — returns predefined extraction results.
 *
 * Useful for testing code that depends on entity extraction
 * without needing a real Nexus API or LLM.
 */
export class MockEntityExtractor implements EntityExtractor {
  private results: ExtractionResult;

  constructor(results?: ExtractionResult) {
    this.results = results ?? { entities: [], relationships: [] };
  }

  async extract(_content: string): Promise<ExtractionResult> {
    return this.results;
  }

  /**
   * Update the mock results for subsequent calls.
   */
  setResults(results: ExtractionResult): void {
    this.results = results;
  }

  /**
   * Convenience: set entities only.
   */
  setEntities(entities: readonly ExtractedEntity[]): void {
    this.results = { ...this.results, entities };
  }

  /**
   * Convenience: set relationships only.
   */
  setRelationships(relationships: readonly ExtractedRelationship[]): void {
    this.results = { ...this.results, relationships };
  }
}
