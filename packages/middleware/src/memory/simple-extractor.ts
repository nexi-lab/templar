/**
 * SimpleFactExtractor — wraps the existing heuristic extraction logic
 * into the pluggable FactExtractor interface.
 *
 * Preserves v1 behavior: raw output as "experience" category with 0.5 importance.
 * Adds pathKey generation for cross-session dedup via Nexus upsert.
 */

import type {
  ExtractedFact,
  FactExtractionContext,
  FactExtractor,
  FactTurnSummary,
} from "./types.js";

/** Minimum output length to be considered for extraction */
const MIN_OUTPUT_LENGTH = 20;

/**
 * Simple heuristic-based fact extractor.
 *
 * Extracts raw agent output as "experience" facts — no LLM call needed.
 * Generates a deterministic pathKey from content for cross-session dedup.
 */
export class SimpleFactExtractor implements FactExtractor {
  async extract(
    turns: readonly FactTurnSummary[],
    _context: FactExtractionContext,
  ): Promise<readonly ExtractedFact[]> {
    const facts: ExtractedFact[] = [];

    for (const turn of turns) {
      const output = turn.output;
      if (output === null || output === undefined) {
        continue;
      }

      const text = typeof output === "string" ? output : String(output);
      if (text.length < MIN_OUTPUT_LENGTH) {
        continue;
      }

      facts.push({
        content: text,
        category: "experience",
        importance: 0.5,
        pathKey: generatePathKey(text),
      });
    }

    return facts;
  }
}

/**
 * Generate a deterministic path_key from content for cross-session dedup.
 *
 * Uses a simple DJB2 hash — fast, deterministic, no crypto dependency.
 * Returns a stable fallback for empty/invalid input.
 */
function generatePathKey(content: string): string {
  if (!content || typeof content !== "string") {
    return "mem:00000000";
  }
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  // Convert to unsigned hex string
  return `mem:${(hash >>> 0).toString(16)}`;
}
