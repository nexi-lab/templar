/**
 * Shared middleware utilities
 */

/**
 * Race a promise against a timeout.
 * Returns the promise result or undefined on timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), ms);
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
