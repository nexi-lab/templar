/**
 * Lightweight typed event emitter with disposer-based subscription.
 *
 * SYNC_WITH: packages/gateway/src/utils/emitter.ts
 * Copied from @templar/gateway utils — local to middleware to avoid
 * cross-package dependency. Extract to shared utility when a third
 * consumer appears.
 *
 * - `on()` returns a disposer function (call it to unsubscribe).
 * - `emit()` calls handlers with try/catch per handler so one failure
 *   does not prevent subsequent handlers from running.
 * - Handlers are stored in an immutable array (snapshot semantics —
 *   registration/removal during emit does not affect the current emit).
 */

// biome-ignore lint/suspicious/noExplicitAny: generic event map constraint
export type EventMap = Record<string, any[]>;

export interface Emitter<E extends EventMap> {
  /** Subscribe to an event. Returns a disposer function. */
  on<K extends keyof E & string>(event: K, handler: (...args: E[K]) => void): () => void;
  /** Emit an event, calling all handlers with try/catch isolation. */
  emit<K extends keyof E & string>(event: K, ...args: E[K]): void;
  /** Remove all handlers for a specific event, or all events if omitted. */
  clear(event?: keyof E & string): void;
  /** Number of handlers registered for a specific event. */
  count(event: keyof E & string): number;
}

/**
 * Create a new typed emitter.
 */
export function createEmitter<E extends EventMap>(): Emitter<E> {
  let handlers = new Map<string, readonly ((...args: unknown[]) => void)[]>();

  return {
    on<K extends keyof E & string>(event: K, handler: (...args: E[K]) => void): () => void {
      const existing = handlers.get(event) ?? [];
      handlers = new Map([
        ...handlers,
        [event, [...existing, handler as (...args: unknown[]) => void]],
      ]);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const current = handlers.get(event) ?? [];
        handlers = new Map([...handlers, [event, current.filter((h) => h !== handler)]]);
      };
    },

    emit<K extends keyof E & string>(event: K, ...args: E[K]): void {
      const list = handlers.get(event);
      if (!list || list.length === 0) return;
      // Snapshot: iterate over current list even if handlers mutate during emit
      for (const handler of list) {
        try {
          handler(...args);
        } catch {
          // Swallow — one handler failure must not break the chain.
        }
      }
    },

    clear(event?: keyof E & string): void {
      if (event !== undefined) {
        const next = new Map(handlers);
        next.delete(event);
        handlers = next;
      } else {
        handlers = new Map();
      }
    },

    count(event: keyof E & string): number {
      return handlers.get(event)?.length ?? 0;
    },
  };
}
