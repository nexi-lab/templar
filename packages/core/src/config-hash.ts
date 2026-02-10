/**
 * Deterministic config hashing for cache keys
 *
 * Uses sorted JSON serialization + DJB2 hash to produce
 * stable cache keys from arbitrary config objects.
 */

/**
 * Recursively sort object keys for deterministic serialization
 */
function sortedStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(sortedStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${sortedStringify(obj[key])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * DJB2 hash algorithm — fast, non-cryptographic hash suitable for cache keys
 *
 * @returns Hex string hash
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode (using bit shift for multiplication)
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit and then hex
  return (hash >>> 0).toString(16);
}

/**
 * Compute a deterministic hash for a config object.
 * Same config content always produces the same hash regardless of key order.
 */
export function hashConfig(config: Readonly<Record<string, unknown>>): string {
  return djb2Hash(sortedStringify(config));
}
