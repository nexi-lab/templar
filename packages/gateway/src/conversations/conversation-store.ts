import type { ConversationKey } from "../protocol/index.js";
import { mapDelete, mapFilter, mapSet } from "../utils/immutable-map.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationBinding {
  readonly conversationKey: ConversationKey;
  readonly nodeId: string;
  readonly createdAt: number;
  readonly lastActiveAt: number;
}

export interface ConversationStoreConfig {
  readonly maxConversations: number;
  readonly conversationTtl: number;
}

// ---------------------------------------------------------------------------
// ConversationStore
// ---------------------------------------------------------------------------

/**
 * Tracks conversation-to-node bindings with TTL expiry and reverse indexing.
 *
 * Immutable maps are used for the primary and reverse indexes — every mutation
 * returns a new map, leaving the previous reference unchanged.
 *
 * Features:
 * - Primary index:   conversationKey → ConversationBinding
 * - Reverse index:   nodeId → Set<conversationKey>  (O(k) node cleanup)
 * - TTL sweep:       removes bindings older than `conversationTtl`
 * - Capacity eviction: evicts oldest binding when `maxConversations` is reached
 */
export class ConversationStore {
  private bindings: ReadonlyMap<string, ConversationBinding> = new Map();
  private nodeIndex: ReadonlyMap<string, ReadonlySet<string>> = new Map();
  private config: ConversationStoreConfig;

  constructor(config: ConversationStoreConfig) {
    this.config = config;
  }

  /**
   * Bind or update a conversation to a node.
   * If the conversation already exists, updates `lastActiveAt` and `nodeId`.
   * Evicts the oldest conversation if capacity is exceeded.
   */
  bind(key: ConversationKey, nodeId: string, now?: number): ConversationBinding {
    const timestamp = now ?? Date.now();
    const existing = this.bindings.get(key);

    // If re-binding to a different node, remove from old node's reverse index
    if (existing && existing.nodeId !== nodeId) {
      this.removeFromNodeIndex(existing.nodeId, key);
    }

    // Evict oldest if at capacity and this is a new key
    if (!existing && this.bindings.size >= this.config.maxConversations) {
      this.evictOldest();
    }

    const binding: ConversationBinding = {
      conversationKey: key,
      nodeId,
      createdAt: existing?.createdAt ?? timestamp,
      lastActiveAt: timestamp,
    };

    this.bindings = mapSet(this.bindings, key, binding);
    this.addToNodeIndex(nodeId, key);

    return binding;
  }

  /**
   * Get the binding for a conversation key.
   */
  get(key: ConversationKey): ConversationBinding | undefined {
    return this.bindings.get(key);
  }

  /**
   * Remove all bindings for a node. Returns the number of bindings removed.
   * Uses the reverse index for O(k) performance where k = bindings for this node.
   */
  removeNode(nodeId: string): number {
    const keys = this.nodeIndex.get(nodeId);
    if (!keys || keys.size === 0) {
      return 0;
    }

    let nextBindings = this.bindings;
    for (const key of keys) {
      nextBindings = mapDelete(nextBindings, key);
    }
    this.bindings = nextBindings;

    const count = keys.size;
    this.nodeIndex = mapDelete(this.nodeIndex, nodeId);
    return count;
  }

  /**
   * Remove expired bindings. Returns the number swept.
   */
  sweep(now?: number): number {
    const cutoff = (now ?? Date.now()) - this.config.conversationTtl;
    let swept = 0;

    // Collect expired keys first to batch updates
    const expiredKeys: string[] = [];
    for (const [key, binding] of this.bindings) {
      if (binding.lastActiveAt < cutoff) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length === 0) {
      return 0;
    }

    // Remove from reverse index
    for (const key of expiredKeys) {
      const binding = this.bindings.get(key);
      if (binding) {
        this.removeFromNodeIndex(binding.nodeId, key);
        swept++;
      }
    }

    // Remove from primary index
    this.bindings = mapFilter(this.bindings, (_key, binding) => binding.lastActiveAt >= cutoff);

    return swept;
  }

  /**
   * Clear all bindings (e.g., on scope config change).
   */
  clear(): void {
    this.bindings = new Map();
    this.nodeIndex = new Map();
  }

  /**
   * Update the store configuration (e.g., on hot-reload).
   */
  updateConfig(config: ConversationStoreConfig): void {
    this.config = config;
  }

  /**
   * Number of tracked conversations.
   */
  get size(): number {
    return this.bindings.size;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private addToNodeIndex(nodeId: string, key: string): void {
    const existing = this.nodeIndex.get(nodeId) ?? new Set<string>();
    const next = new Set(existing);
    next.add(key);
    this.nodeIndex = mapSet(this.nodeIndex, nodeId, next);
  }

  private removeFromNodeIndex(nodeId: string, key: string): void {
    const existing = this.nodeIndex.get(nodeId);
    if (!existing) return;
    const next = new Set(existing);
    next.delete(key);
    if (next.size === 0) {
      this.nodeIndex = mapDelete(this.nodeIndex, nodeId);
    } else {
      this.nodeIndex = mapSet(this.nodeIndex, nodeId, next);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, binding] of this.bindings) {
      if (binding.lastActiveAt < oldestTime) {
        oldestTime = binding.lastActiveAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const binding = this.bindings.get(oldestKey);
      if (binding) {
        this.removeFromNodeIndex(binding.nodeId, oldestKey);
      }
      this.bindings = mapDelete(this.bindings, oldestKey);
    }
  }
}
