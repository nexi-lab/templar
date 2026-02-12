/**
 * Deep freeze utility for making parsed manifest objects immutable.
 */

/**
 * Recursively freezes an object and all nested objects/arrays.
 * Uses a WeakSet to handle circular references safely.
 * Returns the same reference (freezes in-place, no clone).
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  const seen = new WeakSet<object>();
  freezeRecursive(obj as object, seen);
  return obj;
}

function freezeRecursive(obj: object, seen: WeakSet<object>): void {
  if (seen.has(obj)) {
    return;
  }

  seen.add(obj);
  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    if (value !== null && value !== undefined && typeof value === "object") {
      freezeRecursive(value as object, seen);
    }
  }
}
