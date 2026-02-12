/**
 * Immutable Map operations.
 *
 * Every function returns a new Map, leaving the original unchanged.
 */

/**
 * Return a new Map with the entry added or updated.
 */
export function mapSet<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map([...map, [key, value]]);
}

/**
 * Return a new Map without the given key.
 */
export function mapDelete<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

/**
 * Return a new Map containing only entries that match the predicate.
 */
export function mapFilter<K, V>(
  map: ReadonlyMap<K, V>,
  predicate: (key: K, value: V) => boolean,
): ReadonlyMap<K, V> {
  const next = new Map<K, V>();
  for (const [key, value] of map) {
    if (predicate(key, value)) {
      next.set(key, value);
    }
  }
  return next;
}
