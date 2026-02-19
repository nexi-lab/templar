/**
 * LlmObservationExtractor — extracts observations from conversation turns
 * using an LLM call.
 *
 * Follows the EntityExtractor pattern from @templar/entity-memory:
 * a pluggable interface with a default LLM-based implementation.
 */

import { OBSERVER_SYSTEM_PROMPT } from "./observer-prompt.js";
import { parseObservations } from "./parser.js";
import type {
  ExtractionContext,
  ModelCallFn,
  Observation,
  ObservationExtractor,
  TurnSummary,
} from "./types.js";

/** Maximum characters per turn sent to LLM (truncation limit) */
const MAX_TURN_CONTENT_LENGTH = 500;

/** Maximum total user prompt length sent to LLM */
const MAX_USER_PROMPT_LENGTH = 15_000;

/**
 * LLM-based observation extractor.
 *
 * Uses a model-call function (injected) to extract structured observations
 * from conversation turn summaries. The model-call function abstracts the
 * LLM provider — callers can inject Haiku, Gemini Flash, or any cheap model.
 */
export class LlmObservationExtractor implements ObservationExtractor {
  private readonly modelCall: ModelCallFn;

  constructor(modelCall: ModelCallFn) {
    this.modelCall = modelCall;
  }

  async extract(
    turns: readonly TurnSummary[],
    context: ExtractionContext,
  ): Promise<readonly Observation[]> {
    if (turns.length === 0) {
      return [];
    }

    const userPrompt = buildUserPrompt(turns, context);
    const timestamp = new Date().toISOString();

    try {
      const llmOutput = await this.modelCall(OBSERVER_SYSTEM_PROMPT, userPrompt);
      return parseObservations(llmOutput, timestamp);
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
 * Build the user prompt from turn summaries and context.
 *
 * Includes:
 * - Existing observations (for continuity)
 * - Turn summaries with input/output/tool calls
 */
function buildUserPrompt(turns: readonly TurnSummary[], context: ExtractionContext): string {
  const parts: string[] = [];

  // Include existing observations for context continuity
  if (context.existingObservations.length > 0) {
    parts.push("## Previous Observations (for context — do not duplicate)");
    const recentObservations = context.existingObservations.slice(-10);
    for (const obs of recentObservations) {
      parts.push(`- [${obs.priority.toUpperCase()}] ${obs.content}`);
    }
    parts.push("");
  }

  parts.push("## New Turns to Analyze");
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

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      parts.push("**Tool Calls:**");
      for (const tc of turn.toolCalls) {
        const resultPreview = truncate(tc.result, 200);
        parts.push(`  - ${tc.name}: ${resultPreview}`);
      }
    }

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
