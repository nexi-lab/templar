/**
 * Types for memory resources
 */

/**
 * Memory scope - controls visibility and access
 */
export type MemoryScope = "agent" | "user" | "zone" | "global" | "session";

/**
 * Memory state - active or inactive
 */
export type MemoryState = "active" | "inactive";

/**
 * Search mode for memory search
 */
export type SearchMode = "semantic" | "keyword" | "hybrid";

/**
 * A stored memory entry returned from the API
 */
export interface MemoryEntry {
  /** Unique memory identifier */
  memory_id: string;

  /** Memory content (text or structured data) */
  content: string | Record<string, unknown>;

  /** Content hash for deduplication */
  content_hash?: string;

  /** Memory scope */
  scope: string;

  /** Memory type (fact, preference, experience, strategy, etc.) */
  memory_type?: string;

  /** Original importance score (0-1) */
  importance?: number;

  /** Effective importance after decay */
  importance_effective?: number;

  /** Memory state */
  state: string;

  /** Hierarchical namespace */
  namespace?: string;

  /** Unique key within namespace for upsert */
  path_key?: string;

  /** Number of times this memory was accessed */
  access_count?: number;

  /** Extracted entities */
  entities?: Record<string, unknown>[];

  /** Creation timestamp (ISO-8601) */
  created_at?: string;

  /** Last update timestamp (ISO-8601) */
  updated_at?: string;
}

/**
 * Parameters for storing a new memory
 */
export interface StoreMemoryParams {
  /** Memory content (text or structured data) */
  content: string | Record<string, unknown>;

  /** Memory scope */
  scope?: MemoryScope;

  /** Memory type (fact, preference, experience, strategy, etc.) */
  memory_type?: string;

  /** Importance score (0.0 - 1.0) */
  importance?: number;

  /** Hierarchical namespace */
  namespace?: string;

  /** Unique key within namespace for upsert behavior */
  path_key?: string;

  /** Memory state */
  state?: MemoryState;

  /** Extract named entities from content */
  extract_entities?: boolean;

  /** Extract temporal references from content */
  extract_temporal?: boolean;

  /** Extract relationships from content */
  extract_relationships?: boolean;

  /** Store entities to knowledge graph */
  store_to_graph?: boolean;

  /** When fact became valid (ISO-8601) */
  valid_at?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from storing a memory
 */
export interface MemoryStoreResponse {
  /** ID of the stored memory */
  memory_id: string;

  /** Operation status */
  status: string;
}

/**
 * Query parameters for getting a memory by ID
 */
export interface GetMemoryParams {
  /** Include version history */
  include_history?: boolean;

  /** Track access for importance decay */
  track_access?: boolean;
}

/**
 * Parameters for querying memories with filters
 */
export interface QueryMemoriesParams {
  /** Filter by scope */
  scope?: string;

  /** Filter by memory type */
  memory_type?: string;

  /** Filter by exact namespace */
  namespace?: string;

  /** Filter by namespace prefix */
  namespace_prefix?: string;

  /** Filter by state (active, inactive, all) */
  state?: string;

  /** Maximum results */
  limit?: number;

  /** Filter by created after (ISO-8601) */
  after?: string;

  /** Filter by created before (ISO-8601) */
  before?: string;

  /** Filter by time period (e.g., "last week") */
  during?: string;

  /** Filter by entity type */
  entity_type?: string;

  /** Filter by person name */
  person?: string;

  /** Filter by event date >= (ISO-8601) */
  event_after?: string;

  /** Filter by event date <= (ISO-8601) */
  event_before?: string;

  /** Include invalidated memories */
  include_invalid?: boolean;

  /** Include superseded (old version) memories */
  include_superseded?: boolean;

  /** What was TRUE at time X? (ISO-8601) */
  as_of_event?: string;

  /** What did SYSTEM KNOW at time X? (ISO-8601) */
  as_of_system?: string;
}

/**
 * Response from querying memories
 */
export interface QueryMemoriesResponse {
  /** Matching memory entries */
  results: MemoryEntry[];

  /** Total number of results */
  total: number;

  /** Applied filters */
  filters: Record<string, unknown>;
}

/**
 * Parameters for searching memories
 */
export interface SearchMemoriesParams {
  /** Search query */
  query: string;

  /** Filter by scope */
  scope?: string;

  /** Filter by memory type */
  memory_type?: string;

  /** Maximum results (1-100) */
  limit?: number;

  /** Search mode */
  search_mode?: SearchMode;

  /** Filter by created after (ISO-8601) */
  after?: string;

  /** Filter by created before (ISO-8601) */
  before?: string;

  /** Filter by time period */
  during?: string;

  /** Filter by entity type */
  entity_type?: string;

  /** Filter by person name */
  person?: string;
}

/**
 * Response from searching memories
 */
export interface SearchMemoriesResponse {
  /** Matching memory entries */
  results: MemoryEntry[];

  /** Total number of results */
  total: number;

  /** Original search query */
  query: string;

  /** Search mode used */
  search_mode: string;
}

/**
 * Parameters for batch storing memories
 */
export interface BatchStoreMemoriesParams {
  /** List of memories to store */
  memories: StoreMemoryParams[];
}

/**
 * Error detail for a failed batch item
 */
export interface BatchStoreError {
  /** Index of the failed memory in the batch */
  index: number;

  /** Error message */
  error: string;
}

/**
 * Response from batch storing memories
 */
export interface BatchStoreMemoriesResponse {
  /** Number of successfully stored memories */
  stored: number;

  /** Number of failed stores */
  failed: number;

  /** IDs of successfully stored memories */
  memory_ids: string[];

  /** Details of failures (if any) */
  errors?: BatchStoreError[];
}

/**
 * Query parameters for deleting a memory
 */
export interface DeleteMemoryParams {
  /** Soft delete (preserves row, default: true) */
  soft?: boolean;
}

/**
 * Response from deleting a memory
 */
export interface DeleteMemoryResponse {
  /** Whether deletion succeeded */
  deleted: boolean;

  /** ID of the deleted memory */
  memory_id: string;

  /** Whether it was a soft delete */
  soft: boolean;
}

/**
 * Memory with optional version history (returned from get with include_history)
 */
export interface MemoryWithHistory {
  /** The memory entry */
  memory: MemoryEntry;

  /** Version history (if include_history was true) */
  versions?: MemoryVersion[];
}

/**
 * A single version in memory history
 */
export interface MemoryVersion {
  /** Version number */
  version: number;

  /** Content hash for this version */
  content_hash?: string;

  /** When this version was created (ISO-8601) */
  created_at?: string;

  /** Additional version metadata */
  metadata?: Record<string, unknown>;
}
