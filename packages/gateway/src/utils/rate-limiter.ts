/**
 * Sliding window rate limiter.
 *
 * Tracks message count within a 1-second window per connection.
 * Returns false when the rate limit is exceeded.
 */
export class SlidingWindowRateLimiter {
  private readonly maxPerSecond: number;
  private readonly windows: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(maxPerSecond: number) {
    this.maxPerSecond = maxPerSecond;
  }

  /**
   * Check if a message from the given connection is allowed.
   * Returns true if allowed, false if rate limited.
   */
  allow(connectionId: string): boolean {
    const now = Date.now();
    const window = this.windows.get(connectionId);

    if (!window || now - window.windowStart >= 1000) {
      // New window
      this.windows.set(connectionId, { count: 1, windowStart: now });
      return true;
    }

    if (window.count >= this.maxPerSecond) {
      return false;
    }

    // Immutable update — create new window with incremented count
    this.windows.set(connectionId, { count: window.count + 1, windowStart: window.windowStart });
    return true;
  }

  /**
   * Remove tracking for a connection (on disconnect).
   */
  remove(connectionId: string): void {
    this.windows.delete(connectionId);
  }

  /**
   * Clear all tracking state.
   */
  clear(): void {
    this.windows.clear();
  }
}
