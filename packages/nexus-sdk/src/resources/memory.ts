/**
 * Memory resource for managing agent memories
 */

import type {
  BatchStoreMemoriesParams,
  BatchStoreMemoriesResponse,
  DeleteMemoryParams,
  DeleteMemoryResponse,
  GetMemoryParams,
  MemoryStoreResponse,
  MemoryWithHistory,
  QueryMemoriesParams,
  QueryMemoriesResponse,
  SearchMemoriesParams,
  SearchMemoriesResponse,
  StoreMemoryParams,
} from "../types/memory.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing memories via the Nexus Memory API (v2)
 */
export class MemoryResource extends BaseResource {
  /**
   * Store a new memory
   *
   * @param params - Memory storage parameters
   * @returns The stored memory ID and status
   *
   * @example
   * ```typescript
   * const result = await client.memory.store({
   *   content: "User prefers TypeScript",
   *   scope: "agent",
   *   memory_type: "preference",
   *   importance: 0.8,
   * });
   * console.log(result.memory_id);
   * ```
   */
  async store(params: StoreMemoryParams): Promise<MemoryStoreResponse> {
    return this.http.request<MemoryStoreResponse>("/api/v2/memories", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get a memory by ID
   *
   * @param id - Memory ID
   * @param params - Optional query parameters
   * @returns The memory entry with optional version history
   *
   * @example
   * ```typescript
   * const memory = await client.memory.get("mem-123");
   * console.log(memory.memory.content);
   *
   * // With version history
   * const withHistory = await client.memory.get("mem-123", { include_history: true });
   * console.log(withHistory.versions);
   * ```
   */
  async get(id: string, params?: GetMemoryParams): Promise<MemoryWithHistory> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.include_history !== undefined) {
      query.include_history = params.include_history;
    }
    if (params?.track_access !== undefined) {
      query.track_access = params.track_access;
    }

    const hasQuery = Object.keys(query).length > 0;
    return this.http.request<MemoryWithHistory>(`/api/v2/memories/${id}`, {
      method: "GET",
      ...(hasQuery ? { query } : {}),
    });
  }

  /**
   * Query memories with filters
   *
   * Supports temporal, entity, and bi-temporal filters for
   * point-in-time queries.
   *
   * @param params - Query parameters with filters
   * @returns Matching memories with filter metadata
   *
   * @example
   * ```typescript
   * const results = await client.memory.query({
   *   scope: "agent",
   *   memory_type: "fact",
   *   limit: 10,
   * });
   * console.log(results.results);
   * ```
   */
  async query(params: QueryMemoriesParams): Promise<QueryMemoriesResponse> {
    return this.http.request<QueryMemoriesResponse>("/api/v2/memories/query", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Search memories with semantic, keyword, or hybrid search
   *
   * @param params - Search parameters including query string and filters
   * @returns Search results with relevance
   *
   * @example
   * ```typescript
   * const results = await client.memory.search({
   *   query: "user programming preferences",
   *   scope: "user",
   *   search_mode: "hybrid",
   *   limit: 5,
   * });
   * console.log(results.results);
   * ```
   */
  async search(params: SearchMemoriesParams): Promise<SearchMemoriesResponse> {
    return this.http.request<SearchMemoriesResponse>("/api/v2/memories/search", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Batch store multiple memories in a single request
   *
   * @param params - Batch of memories to store
   * @returns Counts of successful and failed stores
   *
   * @example
   * ```typescript
   * const result = await client.memory.batchStore({
   *   memories: [
   *     { content: "Fact 1", scope: "agent", memory_type: "fact" },
   *     { content: "Fact 2", scope: "agent", memory_type: "fact" },
   *   ],
   * });
   * console.log(`Stored: ${result.stored}, Failed: ${result.failed}`);
   * ```
   */
  async batchStore(params: BatchStoreMemoriesParams): Promise<BatchStoreMemoriesResponse> {
    return this.http.request<BatchStoreMemoriesResponse>("/api/v2/memories/batch", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Delete a memory
   *
   * By default performs a soft delete (preserves row for audit trails).
   *
   * @param id - Memory ID
   * @param params - Optional delete parameters
   * @returns Deletion confirmation
   *
   * @example
   * ```typescript
   * // Soft delete (default)
   * await client.memory.delete("mem-123");
   *
   * // Hard delete
   * await client.memory.delete("mem-123", { soft: false });
   * ```
   */
  async delete(id: string, params?: DeleteMemoryParams): Promise<DeleteMemoryResponse> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.soft !== undefined) {
      query.soft = params.soft;
    }

    const hasQuery = Object.keys(query).length > 0;
    return this.http.request<DeleteMemoryResponse>(`/api/v2/memories/${id}`, {
      method: "DELETE",
      ...(hasQuery ? { query } : {}),
    });
  }
}
