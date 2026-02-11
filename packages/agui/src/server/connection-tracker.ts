/**
 * Connection Tracker
 *
 * Tracks active SSE connections with configurable limits.
 * Thread-safe counter for concurrent access.
 */

export class ConnectionTracker {
  private _activeCount = 0;

  constructor(private readonly _maxConnections: number) {}

  /**
   * Attempts to acquire a connection slot.
   * Returns true if successful, false if at capacity.
   */
  acquire(): boolean {
    if (this._activeCount >= this._maxConnections) {
      return false;
    }
    this._activeCount++;
    return true;
  }

  /**
   * Releases a connection slot.
   * Safe to call multiple times — will not go below zero.
   */
  release(): void {
    if (this._activeCount > 0) {
      this._activeCount--;
    }
  }

  /** Number of currently active connections. */
  get activeCount(): number {
    return this._activeCount;
  }

  /** Maximum allowed concurrent connections. */
  get maxConnections(): number {
    return this._maxConnections;
  }
}
