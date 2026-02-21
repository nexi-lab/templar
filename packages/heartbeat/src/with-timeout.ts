/**
 * Per-evaluator timeout utility (Decision 14A).
 *
 * Wraps a promise with a timeout. Throws HeartbeatEvaluatorTimeoutError
 * if the promise does not resolve within the given deadline.
 */

import { HeartbeatEvaluatorTimeoutError } from "@templar/errors";

export function withTimeout<T>(promise: Promise<T>, ms: number, evaluatorName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new HeartbeatEvaluatorTimeoutError(evaluatorName, ms));
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
