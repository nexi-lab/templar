import { AsyncLocalStorage } from "node:async_hooks";
import {
  HookConfigurationError,
  HookExecutionError,
  HookReentrancyError,
  HookTimeoutError,
} from "@templar/errors";
import {
  CONTINUE_RESULT,
  DEFAULT_HOOK_TIMEOUT,
  DEFAULT_MAX_DEPTH,
  HOOK_PRIORITY,
  INTERCEPTOR_EVENTS,
} from "./constants.js";
import type {
  HandlerEntry,
  HookContext,
  HookEvent,
  HookEventMap,
  HookOptions,
  HookRegistryConfig,
  HookResult,
  InterceptorEvent,
  InterceptorEventMap,
  InterceptorHandler,
  ObserverEvent,
  ObserverEventMap,
  ObserverHandler,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const INTERCEPTOR_SET = new Set<string>(INTERCEPTOR_EVENTS);

function isInterceptorEvent(event: string): event is InterceptorEvent {
  return INTERCEPTOR_SET.has(event);
}

/**
 * Binary search for insertion index into a sorted array.
 * Maintains stable insertion order for equal priorities (insert after existing same-priority entries).
 */
function findInsertIndex(entries: readonly HandlerEntry[], priority: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const midEntry = entries[mid];
    if (midEntry !== undefined && midEntry.priority <= priority) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Run a handler with AbortSignal timeout using Promise.race.
 * Returns the handler result or throws HookTimeoutError.
 */
async function runWithTimeout<T>(
  event: string,
  handler: (data: unknown, ctx: HookContext) => T | Promise<T>,
  data: unknown,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      Promise.resolve(handler(data, { signal: controller.signal })),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new HookTimeoutError(event, timeoutMs)),
          { once: true },
        );
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function validateFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new HookConfigurationError(`${name} must be a positive finite number, got ${value}`, [
      `${name} must be > 0`,
    ]);
  }
}

const VALID_ACTIONS = new Set(["continue", "block", "modify"]);

function validateInterceptorResult(event: string, result: unknown): void {
  if (result == null) {
    throw new HookExecutionError(
      event,
      `Interceptor handler returned ${result === null ? "null" : "undefined"} — must return a HookResult object with an "action" property`,
    );
  }
  if (typeof result !== "object" || !("action" in (result as object))) {
    throw new HookExecutionError(
      event,
      `Interceptor handler returned a non-HookResult value — must return an object with an "action" property`,
    );
  }
  const action = (result as { action: unknown }).action;
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    throw new HookExecutionError(
      event,
      `Interceptor handler returned unknown action "${String(action)}" — must be "continue", "block", or "modify"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Re-entrancy tracking via AsyncLocalStorage
// ---------------------------------------------------------------------------

interface DepthContext {
  readonly depth: number;
}

const depthStorage = new AsyncLocalStorage<DepthContext>();

// ---------------------------------------------------------------------------
// HookRegistry
// ---------------------------------------------------------------------------

export class HookRegistry {
  private readonly handlers = new Map<HookEvent, readonly HandlerEntry[]>();
  private readonly maxDepth: number;
  private readonly defaultTimeout: number;
  private readonly onObserverError: ((event: string, error: Error) => void) | undefined;

  constructor(config?: HookRegistryConfig) {
    const maxDepth = config?.maxDepth ?? DEFAULT_MAX_DEPTH;
    const defaultTimeout = config?.defaultTimeout ?? DEFAULT_HOOK_TIMEOUT;

    if (!Number.isFinite(maxDepth) || maxDepth < 1) {
      throw new HookConfigurationError(`maxDepth must be a positive integer, got ${maxDepth}`, [
        "maxDepth must be >= 1",
      ]);
    }
    if (!Number.isFinite(defaultTimeout) || defaultTimeout <= 0) {
      throw new HookConfigurationError(
        `defaultTimeout must be a positive number, got ${defaultTimeout}`,
        ["defaultTimeout must be > 0"],
      );
    }

    this.maxDepth = maxDepth;
    this.defaultTimeout = defaultTimeout;
    this.onObserverError = config?.onObserverError;
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a handler for an interceptor event.
   * Returns a disposer function that removes the handler.
   */
  on<E extends InterceptorEvent>(
    event: E,
    handler: InterceptorHandler<InterceptorEventMap[E]>,
    options?: HookOptions<InterceptorEventMap[E]>,
  ): () => void;

  /**
   * Register a handler for an observer event.
   * Returns a disposer function that removes the handler.
   */
  on<E extends ObserverEvent>(
    event: E,
    handler: ObserverHandler<ObserverEventMap[E]>,
    options?: HookOptions<ObserverEventMap[E]>,
  ): () => void;

  on(
    event: HookEvent,
    handler: InterceptorHandler<unknown> | ObserverHandler<unknown>,
    options?: HookOptions,
  ): () => void {
    return this.registerHandler(event, handler, options, false);
  }

  /**
   * Register a one-shot handler for an interceptor event.
   * The handler is automatically removed after it fires once.
   * Returns a disposer function that removes the handler.
   */
  once<E extends InterceptorEvent>(
    event: E,
    handler: InterceptorHandler<InterceptorEventMap[E]>,
    options?: HookOptions<InterceptorEventMap[E]>,
  ): () => void;

  /**
   * Register a one-shot handler for an observer event.
   * The handler is automatically removed after it fires once.
   * Returns a disposer function that removes the handler.
   */
  once<E extends ObserverEvent>(
    event: E,
    handler: ObserverHandler<ObserverEventMap[E]>,
    options?: HookOptions<ObserverEventMap[E]>,
  ): () => void;

  once(
    event: HookEvent,
    handler: InterceptorHandler<unknown> | ObserverHandler<unknown>,
    options?: HookOptions,
  ): () => void {
    return this.registerHandler(event, handler, options, true);
  }

  /**
   * Remove an interceptor handler for an event by reference.
   */
  off<E extends InterceptorEvent>(
    event: E,
    handler: InterceptorHandler<InterceptorEventMap[E]>,
  ): void;

  /**
   * Remove an observer handler for an event by reference.
   */
  off<E extends ObserverEvent>(event: E, handler: ObserverHandler<ObserverEventMap[E]>): void;

  off(event: HookEvent, handler: InterceptorHandler<unknown> | ObserverHandler<unknown>): void {
    this.removeHandler(event, handler);
  }

  // -------------------------------------------------------------------------
  // Emit
  // -------------------------------------------------------------------------

  /**
   * Emit an interceptor event. Returns HookResult with waterfall semantics.
   */
  emit<E extends InterceptorEvent>(
    event: E,
    data: InterceptorEventMap[E],
  ): Promise<HookResult<InterceptorEventMap[E]>>;

  /**
   * Emit an observer event. Returns void.
   */
  emit<E extends ObserverEvent>(event: E, data: ObserverEventMap[E]): Promise<void>;

  // biome-ignore lint/suspicious/noConfusingVoidType: void required for overload compatibility with Promise<void>
  async emit(event: HookEvent, data: HookEventMap[HookEvent]): Promise<HookResult<unknown> | void> {
    // Fast path: no handlers
    const entries = this.handlers.get(event);
    if (!entries || entries.length === 0) {
      return isInterceptorEvent(event) ? CONTINUE_RESULT : undefined;
    }

    // Re-entrancy guard using AsyncLocalStorage (safe under concurrent emits)
    const parentCtx = depthStorage.getStore();
    const currentDepth = (parentCtx?.depth ?? 0) + 1;
    if (currentDepth > this.maxDepth) {
      throw new HookReentrancyError(event, currentDepth, this.maxDepth);
    }

    return depthStorage.run({ depth: currentDepth }, async () => {
      // Handler list is safe to iterate: on()/off() always replace the
      // array reference rather than mutating, so `entries` is stable.
      if (isInterceptorEvent(event)) {
        return await this.emitInterceptor(event, data, entries);
      }
      await this.emitObserver(event, data, entries);
      return undefined;
    });
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /** Remove all handlers for a specific event, or all events if no arg */
  clear(event?: HookEvent): void {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /** Get the number of handlers registered for an event */
  handlerCount(event: HookEvent): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private registerHandler(
    event: HookEvent,
    handler: InterceptorHandler<unknown> | ObserverHandler<unknown>,
    options: HookOptions | undefined,
    once: boolean,
  ): () => void {
    const priority = options?.priority ?? HOOK_PRIORITY.NORMAL;
    const timeout = options?.timeout ?? this.defaultTimeout;

    if (options?.priority !== undefined) {
      if (!Number.isFinite(options.priority)) {
        throw new HookConfigurationError(
          `priority must be a finite number, got ${options.priority}`,
        );
      }
    }
    if (options?.timeout !== undefined) {
      validateFinitePositive(options.timeout, "timeout");
    }

    const entry: HandlerEntry = {
      handler,
      priority,
      timeout,
      once,
      ...(options?.match ? { match: options.match as (data: unknown) => boolean } : {}),
    };

    const existing = this.handlers.get(event) ?? [];
    const insertIdx = findInsertIndex(existing, priority);

    // Create new sorted array (immutable)
    const updated = [...existing.slice(0, insertIdx), entry, ...existing.slice(insertIdx)];
    this.handlers.set(event, updated);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.removeHandler(event, handler);
    };
  }

  private removeHandler(
    event: HookEvent,
    handler: InterceptorHandler<unknown> | ObserverHandler<unknown>,
  ): void {
    const existing = this.handlers.get(event);
    if (!existing) return;

    const idx = existing.findIndex((e) => e.handler === handler);
    if (idx === -1) return;

    // Create new array without the handler (immutable)
    const updated = [...existing.slice(0, idx), ...existing.slice(idx + 1)];
    if (updated.length === 0) {
      this.handlers.delete(event);
    } else {
      this.handlers.set(event, updated);
    }
  }

  private async emitInterceptor(
    event: string,
    initialData: unknown,
    entries: readonly HandlerEntry[],
  ): Promise<HookResult<unknown>> {
    let currentData = initialData;
    let modified = false;
    const firedOnceEntries: HandlerEntry[] = [];

    try {
      for (const entry of entries) {
        // Check match predicate — receives waterfalled data
        if (entry.match) {
          let matched: boolean;
          try {
            matched = entry.match(currentData);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new HookExecutionError(
              event as HookEvent,
              `match predicate threw: ${message}`,
              err instanceof Error ? err : undefined,
            );
          }
          if (!matched) continue;
        }

        const handler = entry.handler as InterceptorHandler<unknown>;

        let result: unknown;
        try {
          result = await runWithTimeout(event, handler, currentData, entry.timeout);
        } catch (err) {
          // Once handlers that throw are still removed
          if (entry.once) {
            firedOnceEntries.push(entry);
          }
          // Wrap non-HookTimeoutError/HookReentrancyError in HookExecutionError
          if (err instanceof HookTimeoutError || err instanceof HookReentrancyError) {
            throw err;
          }
          const message = err instanceof Error ? err.message : String(err);
          throw new HookExecutionError(
            event as HookEvent,
            message,
            err instanceof Error ? err : undefined,
          );
        }

        // Runtime validation of handler return
        validateInterceptorResult(event, result);

        // Mark once entry as fired
        if (entry.once) {
          firedOnceEntries.push(entry);
        }

        const validResult = result as HookResult<unknown>;
        if (validResult.action === "block") {
          return validResult;
        }
        if (validResult.action === "modify") {
          currentData = validResult.data;
          modified = true;
        }
        // "continue" — data unchanged, move to next handler
      }

      return modified ? { action: "modify", data: currentData } : CONTINUE_RESULT;
    } finally {
      this.cleanupOnceEntries(event as HookEvent, firedOnceEntries);
    }
  }

  private async emitObserver(
    event: string,
    data: unknown,
    entries: readonly HandlerEntry[],
  ): Promise<void> {
    const firedOnceEntries: HandlerEntry[] = [];

    try {
      for (const entry of entries) {
        // Check match predicate
        if (entry.match) {
          let matched: boolean;
          try {
            matched = entry.match(data);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (this.onObserverError) {
              this.onObserverError(event, error);
            } else {
              console.warn(`[@templar/hooks] Observer match predicate error on "${event}":`, error);
            }
            continue;
          }
          if (!matched) continue;
        }

        const handler = entry.handler as ObserverHandler<unknown>;

        try {
          await runWithTimeout(event, handler, data, entry.timeout);
          // Mark once entry as fired
          if (entry.once) {
            firedOnceEntries.push(entry);
          }
        } catch (err) {
          // Once handlers that throw are still removed
          if (entry.once) {
            firedOnceEntries.push(entry);
          }
          // Re-entrancy errors should propagate
          if (err instanceof HookReentrancyError) {
            throw err;
          }
          // Observer errors are caught and reported — don't abort the chain
          const error = err instanceof Error ? err : new Error(String(err));
          if (this.onObserverError) {
            this.onObserverError(event, error);
          } else {
            console.warn(`[@templar/hooks] Observer error on "${event}":`, error);
          }
        }
      }
    } finally {
      this.cleanupOnceEntries(event as HookEvent, firedOnceEntries);
    }
  }

  private cleanupOnceEntries(event: HookEvent, firedEntries: readonly HandlerEntry[]): void {
    for (const entry of firedEntries) {
      this.removeHandler(event, entry.handler);
    }
  }
}
