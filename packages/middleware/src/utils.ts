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
