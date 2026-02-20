/**
 * Per-agent allowlist store — in-memory with dirty-flag tracking.
 *
 * Tracks approval counts and auto-promotes commands after N human approvals.
 */

import type { AllowlistEntry, CommandPattern } from "./types.js";

export class AllowlistStore {
  private entries: Map<CommandPattern, AllowlistEntry>;
  private dirty: boolean;
  private readonly maxPatterns: number;

  constructor(maxPatterns: number) {
    this.entries = new Map();
    this.dirty = false;
    this.maxPatterns = maxPatterns;
  }

  has(pattern: CommandPattern): boolean {
    return this.entries.has(pattern);
  }

  get(pattern: CommandPattern): AllowlistEntry | undefined {
    return this.entries.get(pattern);
  }

  /**
   * Records an approval for a command pattern.
   * Auto-promotes if the approval count reaches the threshold.
   * Respects maxPatterns cap.
   *
   * @returns The updated or newly created entry
   */
  recordApproval(pattern: CommandPattern, threshold: number): AllowlistEntry {
    const existing = this.entries.get(pattern);

    if (existing) {
      const newCount = existing.approvalCount + 1;
      const updated: AllowlistEntry = {
        pattern,
        approvalCount: newCount,
        autoPromoted: newCount >= threshold,
        lastApprovedAt: Date.now(),
      };
      this.entries = new Map(this.entries);
      this.entries.set(pattern, updated);
      this.dirty = true;
      return updated;
    }

    // New entry — check cap
    if (this.entries.size >= this.maxPatterns) {
      // Evict least-recently-approved entry
      this.evictOldest();
    }

    const entry: AllowlistEntry = {
      pattern,
      approvalCount: 1,
      autoPromoted: 1 >= threshold,
      lastApprovedAt: Date.now(),
    };

    this.entries = new Map(this.entries);
    this.entries.set(pattern, entry);
    this.dirty = true;
    return entry;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markClean(): void {
    this.dirty = false;
  }

  /**
   * Returns the current entries as a readonly array for serialization.
   */
  toArray(): readonly AllowlistEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Loads entries from a serialized array (e.g., from Nexus).
   */
  loadFrom(entries: readonly AllowlistEntry[]): void {
    this.entries = new Map();
    for (const entry of entries) {
      this.entries.set(entry.pattern, entry);
    }
    this.dirty = false;
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    let oldestKey: CommandPattern | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.lastApprovedAt < oldestTime) {
        oldestTime = entry.lastApprovedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.entries = new Map(this.entries);
      this.entries.delete(oldestKey);
    }
  }
}
