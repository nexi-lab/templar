/**
 * Parsing utilities for fact extraction LLM output.
 *
 * Handles well-formed, malformed, and empty LLM responses gracefully.
 */

import type { ExtractedFact, MemoryCategory } from "./types.js";

// ---------------------------------------------------------------------------
// Fact parsing
// ---------------------------------------------------------------------------

/**
 * Parse LLM output into ExtractedFact[].
 *
 * Expected format per line:
 *   CATEGORY | IMPORTANCE | fact content
 *
 * Lines that don't match are silently skipped (graceful degradation).
 */
export function parseFacts(llmOutput: string): readonly ExtractedFact[] {
  if (!llmOutput.trim()) {
    return [];
  }

  const lines = llmOutput.split("\n").filter((line) => line.trim().length > 0);
  const facts: ExtractedFact[] = [];

  for (const line of lines) {
    const parsed = parseFactLine(line.trim());
    if (parsed !== undefined) {
      facts.push(parsed);
    }
  }

  return facts;
}

/**
 * Parse a single fact line.
 * Returns undefined if the line doesn't match the expected format.
 */
function parseFactLine(line: string): ExtractedFact | undefined {
  // Split on first two pipes to preserve content with embedded pipes
  const firstPipe = line.indexOf("|");
  if (firstPipe === -1) return undefined;

  const secondPipe = line.indexOf("|", firstPipe + 1);
  if (secondPipe === -1) return undefined;

  const categoryRaw = line.slice(0, firstPipe).trim().toLowerCase();
  const importanceRaw = line.slice(firstPipe + 1, secondPipe).trim();
  const content = line.slice(secondPipe + 1).trim();

  if (!content) {
    return undefined;
  }

  const category = parseCategory(categoryRaw);
  if (category === undefined) {
    return undefined;
  }

  const importance = Number.parseFloat(importanceRaw);
  if (!Number.isFinite(importance)) {
    return undefined;
  }

  return {
    content,
    category,
    importance: Math.max(0, Math.min(1, importance)),
  };
}

/**
 * Parse category string into MemoryCategory.
 */
function parseCategory(raw: string): MemoryCategory | undefined {
  switch (raw) {
    case "fact":
      return "fact";
    case "preference":
      return "preference";
    case "decision":
      return "decision";
    case "experience":
      return "experience";
    default:
      return undefined;
  }
}
