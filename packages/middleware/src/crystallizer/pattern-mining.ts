/**
 * PrefixSpan sequential pattern mining (#164)
 *
 * Discovers frequent tool-call subsequences from historical session data.
 * Uses the PrefixSpan (Prefix-projected Sequential pattern mining) algorithm:
 *
 * 1. Find all frequent 1-item prefixes
 * 2. For each frequent prefix, project the database (find suffixes after the prefix)
 * 3. Recursively grow prefixes with frequent extensions
 * 4. Return patterns within [minLength, maxLength] with support >= minSupport
 *
 * Reference: Pei et al., "PrefixSpan: Mining Sequential Patterns Efficiently
 * by Prefix-Projected Pattern Growth", ICDE 2001.
 */

import type { MinedPattern, SessionSequence } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mine frequent sequential patterns from a set of tool-name sequences.
 *
 * @param sequences - Array of ordered tool-name sequences (one per session)
 * @param minSupport - Minimum number of sequences containing the pattern
 * @param minLength - Minimum pattern length (tools in sequence)
 * @param maxLength - Maximum pattern length (tools in sequence)
 * @returns Discovered patterns sorted by support (descending)
 */
export function mineFrequentSequences(
  sequences: readonly (readonly string[])[],
  minSupport: number,
  minLength: number,
  maxLength: number,
): readonly MinedPattern[] {
  if (sequences.length === 0 || minSupport < 1 || minLength < 1 || maxLength < minLength) {
    return [];
  }

  const results: MinedPattern[] = [];

  // Build initial projected database: for each unique item, find all
  // sequences that contain it and the suffixes starting after the item.
  const itemCounts = new Map<string, number>();
  for (const seq of sequences) {
    const seen = new Set<string>();
    for (const item of seq) {
      if (item.length === 0) continue;
      if (!seen.has(item)) {
        seen.add(item);
        itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
      }
    }
  }

  // For each frequent 1-item prefix, recurse
  for (const [item, count] of itemCounts) {
    if (count < minSupport) continue;

    const prefix: readonly string[] = [item];
    const projected = projectDatabase(sequences, item);

    if (prefix.length >= minLength) {
      results.push({ tools: prefix, support: count, successRate: 0 });
    }

    if (prefix.length < maxLength) {
      growPrefix(prefix, projected, minSupport, minLength, maxLength, results);
    }
  }

  // Sort by support descending, then by pattern length descending
  results.sort((a, b) => b.support - a.support || b.tools.length - a.tools.length);

  return results;
}

/**
 * Calculate weighted average success rate for a pattern across matching sessions.
 *
 * For each tool in the pattern, looks up that tool's success/failure counts
 * in each session's successMap. Computes per-tool success rate, then averages
 * across all tools in the pattern.
 *
 * If a tool has no data in a session's successMap, it is treated as successful
 * (optimistic — no data means no observed failures).
 *
 * @param pattern - The tool-name pattern to evaluate
 * @param sessions - Historical session sequences with success maps
 * @returns Weighted success rate between 0 and 1
 */
export function calculatePatternSuccessRate(
  pattern: readonly string[],
  sessions: readonly SessionSequence[],
): number {
  if (pattern.length === 0 || sessions.length === 0) {
    return 0;
  }

  // Filter to sessions that contain the pattern as a subsequence
  const matchingSessions = sessions.filter((s) => containsSubsequence(s.sequence, pattern));

  if (matchingSessions.length === 0) {
    return 0;
  }

  let totalRate = 0;

  for (const session of matchingSessions) {
    let sessionToolRateSum = 0;

    for (const tool of pattern) {
      const stats = session.successMap[tool];
      if (stats === undefined) {
        // No data = optimistic, treat as success
        sessionToolRateSum += 1;
      } else {
        const total = stats.success + stats.failure;
        sessionToolRateSum += total > 0 ? stats.success / total : 1;
      }
    }

    totalRate += sessionToolRateSum / pattern.length;
  }

  return totalRate / matchingSessions.length;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Project the database: for each sequence that contains `item`,
 * return the suffix starting after the first occurrence of `item`.
 */
function projectDatabase(
  sequences: readonly (readonly string[])[],
  item: string,
): readonly (readonly string[])[] {
  const projected: (readonly string[])[] = [];

  for (const seq of sequences) {
    const idx = seq.indexOf(item);
    if (idx !== -1 && idx < seq.length - 1) {
      projected.push(seq.slice(idx + 1));
    }
  }

  return projected;
}

/**
 * Recursively grow the prefix by finding frequent extensions
 * in the projected database.
 */
function growPrefix(
  prefix: readonly string[],
  projectedDb: readonly (readonly string[])[],
  minSupport: number,
  minLength: number,
  maxLength: number,
  results: MinedPattern[],
): void {
  // Count frequency of each item as the first element in projected sequences
  const itemCounts = new Map<string, number>();
  for (const seq of projectedDb) {
    const seen = new Set<string>();
    for (const item of seq) {
      if (item.length === 0) continue;
      if (!seen.has(item)) {
        seen.add(item);
        itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
      }
    }
  }

  for (const [item, count] of itemCounts) {
    if (count < minSupport) continue;

    const newPrefix: readonly string[] = [...prefix, item];
    const newProjected = projectDatabase(projectedDb, item);

    if (newPrefix.length >= minLength) {
      results.push({ tools: newPrefix, support: count, successRate: 0 });
    }

    if (newPrefix.length < maxLength) {
      growPrefix(newPrefix, newProjected, minSupport, minLength, maxLength, results);
    }
  }
}

/**
 * Check if `haystack` contains `needle` as a subsequence (order-preserving, not contiguous).
 */
function containsSubsequence(haystack: readonly string[], needle: readonly string[]): boolean {
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (haystack[hi] === needle[ni]) {
      ni++;
    }
  }
  return ni === needle.length;
}
