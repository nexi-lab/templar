import type { Diagnostic } from "vscode-languageserver-protocol";

/**
 * LRU cache for diagnostics published by language servers.
 * Entries are immutable (frozen arrays).
 */
export class DiagnosticsCache {
  private readonly entries = new Map<string, readonly Diagnostic[]>();
  private readonly accessOrder: string[] = [];

  constructor(private readonly maxEntries: number) {}

  set(uri: string, diagnostics: readonly Diagnostic[]): void {
    // Remove from access order if already present
    const idx = this.accessOrder.indexOf(uri);
    if (idx !== -1) this.accessOrder.splice(idx, 1);

    // Evict LRU if at capacity
    while (this.entries.size >= this.maxEntries && this.accessOrder.length > 0) {
      const evicted = this.accessOrder.shift()!;
      this.entries.delete(evicted);
    }

    this.entries.set(uri, Object.freeze([...diagnostics]));
    this.accessOrder.push(uri);
  }

  get(uri: string): readonly Diagnostic[] | undefined {
    const result = this.entries.get(uri);
    if (result !== undefined) {
      // Move to end of access order
      const idx = this.accessOrder.indexOf(uri);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this.accessOrder.push(uri);
    }
    return result;
  }

  delete(uri: string): void {
    this.entries.delete(uri);
    const idx = this.accessOrder.indexOf(uri);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
  }

  clear(): void {
    this.entries.clear();
    this.accessOrder.length = 0;
  }

  get size(): number {
    return this.entries.size;
  }
}
