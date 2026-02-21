/**
 * LRU cache mapping email Message-IDs to Templar thread IDs.
 *
 * Used to resolve email threading (In-Reply-To + References headers)
 * to Templar's threadId field. Bounded to prevent unbounded growth.
 */
export class ThreadCache {
  private readonly cache: Map<string, string>;
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Store a Message-ID → threadId mapping.
   * If the cache is full, evicts the oldest (least recently used) entry.
   */
  set(messageId: string, threadId: string): void {
    // Delete first to refresh position if key exists
    if (this.cache.has(messageId)) {
      this.cache.delete(messageId);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(messageId, threadId);
  }

  /**
   * Look up the threadId for a given Message-ID.
   * Returns undefined if not found. Refreshes LRU position on hit.
   */
  getThreadId(messageId: string): string | undefined {
    const value = this.cache.get(messageId);
    if (value === undefined) return undefined;

    // Refresh LRU position
    this.cache.delete(messageId);
    this.cache.set(messageId, value);
    return value;
  }

  /**
   * Resolve a threadId from In-Reply-To and References headers.
   *
   * Priority: inReplyTo > last matching reference.
   * Returns undefined if no match found.
   */
  resolve(inReplyTo: string | undefined, references: readonly string[]): string | undefined {
    // Try inReplyTo first
    if (inReplyTo !== undefined) {
      const threadId = this.getThreadId(inReplyTo);
      if (threadId !== undefined) return threadId;
    }

    // Fall back to references (last match wins — most recent in chain)
    for (let i = references.length - 1; i >= 0; i--) {
      const ref = references[i];
      if (ref !== undefined) {
        const threadId = this.getThreadId(ref);
        if (threadId !== undefined) return threadId;
      }
    }

    return undefined;
  }

  /** Current number of entries in the cache */
  get size(): number {
    return this.cache.size;
  }
}
