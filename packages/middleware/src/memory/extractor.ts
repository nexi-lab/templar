/**
 * LlmFactExtractor — extracts categorized facts from conversation turns
 * using an LLM call.
 *
 * Follows the LlmObservationExtractor pattern from observational memory:
 * a pluggable interface with a default LLM-based implementation.
 */

import { FACT_EXTRACTION_SYSTEM_PROMPT } from "./fact-prompt.js";
import { parseFacts } from "./parser.js";
import type {
  ExtractedFact,
  FactExtractionContext,
  FactExtractor,
  FactTurnSummary,
  ModelCallFn,
} from "./types.js";

/** Maximum characters per turn field sent to LLM (truncation limit) */
const MAX_TURN_CONTENT_LENGTH = 500;

/** Maximum total user prompt length sent to LLM */
const MAX_USER_PROMPT_LENGTH = 15_000;

/**
 * LLM-based fact extractor.
 *
 * Uses a model-call function (injected) to extract structured facts
 * from conversation turn summaries. The model-call function abstracts the
 * LLM provider — callers can inject Haiku, Gemini Flash, or any cheap model.
 */
export class LlmFactExtractor implements FactExtractor {
  private readonly modelCall: ModelCallFn;

  constructor(modelCall: ModelCallFn) {
    this.modelCall = modelCall;
  }

  async extract(
    turns: readonly FactTurnSummary[],
    _context: FactExtractionContext,
  ): Promise<readonly ExtractedFact[]> {
    if (turns.length === 0) {
      return [];
    }

    const userPrompt = buildUserPrompt(turns);

    try {
      const llmOutput = await this.modelCall(FACT_EXTRACTION_SYSTEM_PROMPT, userPrompt);
      return parseFacts(llmOutput);
    } catch {
      // Graceful degradation — extraction failure should never interrupt the agent
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the user prompt from turn summaries.
 */
function buildUserPrompt(turns: readonly FactTurnSummary[]): string {
  const parts: string[] = [];

  parts.push("## Turns to Analyze");
  parts.push("");

  for (const turn of turns) {
    parts.push(`### Turn ${turn.turnNumber} (${turn.timestamp})`);

    const inputPreview = truncate(
      typeof turn.input === "string" ? turn.input : String(turn.input),
      MAX_TURN_CONTENT_LENGTH,
    );
    parts.push(`**Input:** ${inputPreview}`);

    const outputPreview = truncate(
      typeof turn.output === "string" ? turn.output : String(turn.output),
      MAX_TURN_CONTENT_LENGTH,
    );
    parts.push(`**Output:** ${outputPreview}`);
    parts.push("");
  }

  const fullPrompt = parts.join("\n");
  return truncate(fullPrompt, MAX_USER_PROMPT_LENGTH);
}

/**
 * Truncate a string to maxLength, appending "..." if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}
