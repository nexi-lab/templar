/**
 * Generic timeout utility for async operations.
 *
 * Returns undefined on timeout (graceful degradation) rather than throwing.
 */

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      resolve(undefined);
    }, ms);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
