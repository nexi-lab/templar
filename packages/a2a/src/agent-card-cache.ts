/**
 * LRU-bounded TTL cache for A2A Agent Cards.
 *
 * - Configurable TTL (default 5 min) and max entries (default 100)
 * - LRU eviction when cache is full
 * - Uses Map insertion order for LRU tracking
 */

import type { AgentInfo } from "./types.js";
import { DEFAULT_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS } from "./types.js";

interface CacheEntry {
  readonly card: AgentInfo;
  readonly expiresAt: number;
}

export interface AgentCardCacheConfig {
  /** TTL in milliseconds (default: 300_000 = 5 min) */
  readonly ttlMs?: number | undefined;
  /** Maximum number of cached entries (default: 100) */
  readonly maxEntries?: number | undefined;
}

export class AgentCardCache {
  private readonly entries: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(config?: AgentCardCacheConfig) {
    this.ttlMs = config?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = config?.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  }

  /**
   * Get a cached Agent Card if it exists and hasn't expired.
   * Moves the entry to the end (most-recently-used) on access.
   */
  get(url: string): AgentInfo | undefined {
    const entry = this.entries.get(url);
    if (entry === undefined) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(url);
      return undefined;
    }

    // Move to end for LRU tracking (delete + re-insert)
    this.entries.delete(url);
    this.entries.set(url, entry);

    return entry.card;
  }

  /**
   * Store an Agent Card in the cache.
   * Evicts the least-recently-used entry if cache is full.
   */
  set(url: string, card: AgentInfo): void {
    // Remove existing entry first (to update position)
    this.entries.delete(url);

    // Evict LRU entry if at capacity
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(url, {
      card,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Remove a specific entry from the cache.
   */
  delete(url: string): boolean {
    return this.entries.delete(url);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Check if a URL is cached (and not expired).
   */
  has(url: string): boolean {
    return this.get(url) !== undefined;
  }

  /**
   * Number of entries currently in the cache (including expired).
   * Use for diagnostics; expired entries are lazily evicted on get().
   */
  get size(): number {
    return this.entries.size;
  }
}
