/**
 * Shared middleware utilities
 */

/**
 * Race a promise against a timeout.
 * Returns the promise result or undefined on timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timer);
      return val;
    }),
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    }),
  ]);
}

/**
 * Execute an async operation with timeout, try/catch, and logging.
 *
 * Combines `withTimeout` + error handling + structured logging
 * into a single helper. Returns the result on success, undefined
 * on timeout or error.
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param tag - Middleware name for log prefix (e.g., "nexus-audit")
 * @param sessionId - Session ID for log context
 * @returns Result on success, undefined on timeout or error
 */
/**
 * Log a warning with a consistent format: [tag] Session sessionId: message
 */
export function logWarn(tag: string, sessionId: string, message: string): void {
  console.warn(`[${tag}] Session ${sessionId}: ${message}`);
}

export async function safeCall<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  tag: string,
  sessionId: string,
): Promise<T | undefined> {
  try {
    const result = await withTimeout(fn(), timeoutMs);
    if (result === undefined) {
      console.warn(`[${tag}] Session ${sessionId}: operation timed out after ${timeoutMs}ms`);
    }
    return result;
  } catch (error) {
    console.warn(
      `[${tag}] Session ${sessionId}: operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

/**
 * Options for `safeNexusCall` — combines timeout, fallback, and labeling.
 */
export interface SafeNexusCallOptions<T> {
  /** Timeout in milliseconds */
  readonly timeout: number;
  /** Fallback value returned on timeout or error */
  readonly fallback: T;
  /** Label for log messages (e.g., "nexus-ace:playbooks") */
  readonly label: string;
}

/**
 * Execute an async Nexus API call with timeout, error handling, and a typed fallback.
 *
 * Unlike `safeCall` (which returns `T | undefined`), this always returns `T`
 * by using a caller-supplied fallback value on failure. This eliminates
 * undefined checks in calling code and makes the happy path cleaner.
 *
 * @param fn - Async function to execute
 * @param options - Timeout, fallback, and label configuration
 * @returns Result on success, fallback on timeout or error
 */
export async function safeNexusCall<T>(
  fn: () => Promise<T>,
  options: SafeNexusCallOptions<T>,
): Promise<T> {
  try {
    const result = await withTimeout(fn(), options.timeout);
    return result ?? options.fallback;
  } catch (error) {
    console.warn(
      `[${options.label}] Call failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return options.fallback;
  }
}
