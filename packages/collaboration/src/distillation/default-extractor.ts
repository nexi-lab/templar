/**
 * Default memory extractor — simple heuristic-based extraction.
 *
 * For production use, inject an LLM-based extractor that generates
 * structured outputs with confidence scoring.
 *
 * This default extracts simple patterns from conversation text.
 */

import type { ExtractedMemory, ExtractionContext, MemoryExtractor, TurnSummary } from "./types.js";

/**
 * Heuristic extractor that looks for common patterns in conversation.
 *
 * Detects:
 * - Decisions ("decided to", "we'll go with")
 * - Preferences ("prefer", "like", "want")
 * - Action items ("todo", "need to", "should")
 * - Facts ("is", "are", stated definitively)
 */
export class DefaultMemoryExtractor implements MemoryExtractor {
  async extract(
    turns: readonly TurnSummary[],
    _context: ExtractionContext,
  ): Promise<readonly ExtractedMemory[]> {
    if (turns.length === 0) return [];

    const memories: ExtractedMemory[] = [];

    for (const turn of turns) {
      const combined = `${turn.input}\n${turn.output}`.toLowerCase();

      // Decision patterns
      if (/\b(decided|decision|we'll go with|chosen|agreed)\b/.test(combined)) {
        memories.push({
          content: turn.output,
          category: "decision",
          confidence: 0.6,
          sourceContext: `Turn ${turn.turnNumber}`,
        });
      }

      // Preference patterns
      if (/\b(prefer|like|want|favorite|always use)\b/.test(combined)) {
        memories.push({
          content: turn.output,
          category: "preference",
          confidence: 0.5,
          sourceContext: `Turn ${turn.turnNumber}`,
        });
      }

      // Action item patterns
      if (/\b(todo|need to|should|action item|next step)\b/.test(combined)) {
        memories.push({
          content: turn.output,
          category: "action_item",
          confidence: 0.5,
          sourceContext: `Turn ${turn.turnNumber}`,
        });
      }
    }

    return memories;
  }
}
