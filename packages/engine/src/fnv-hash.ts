/**
 * FNV-1a 32-bit hash of a string.
 * Used for exact output matching in loop detection.
 * Non-cryptographic — optimized for speed, not collision resistance.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned 32-bit
}
