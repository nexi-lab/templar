/**
 * ObservationReflector — synthesizes observations into higher-level insights.
 *
 * Uses an LLM call to combine related observations, identify patterns,
 * and produce condensed reflections for long-term context.
 */

import { REFLECTOR_SYSTEM_PROMPT } from "./observer-prompt.js";
import { parseReflections } from "./parser.js";
import type { ModelCallFn, ObservationReflector, Reflection, ReflectionInput } from "./types.js";

/**
 * LLM-based observation reflector.
 *
 * Processes a batch of observations and produces higher-level insights.
 * Uses a cheap/fast model (injected via modelCall) for cost efficiency.
 */
export class LlmObservationReflector implements ObservationReflector {
  private readonly modelCall: ModelCallFn;

  constructor(modelCall: ModelCallFn) {
    this.modelCall = modelCall;
  }

  async reflect(input: ReflectionInput): Promise<readonly Reflection[]> {
    if (input.observations.length === 0) {
      return [];
    }

    const userPrompt = buildReflectionPrompt(input);
    const timestamp = new Date().toISOString();

    try {
      const llmOutput = await this.modelCall(REFLECTOR_SYSTEM_PROMPT, userPrompt);
      return parseReflections(llmOutput, timestamp, input.observations.length);
    } catch {
      // Graceful degradation — reflection failure should never interrupt the session
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildReflectionPrompt(input: ReflectionInput): string {
  const parts: string[] = [];

  parts.push(`## Observations to Synthesize (${input.observations.length} total)`);
  parts.push(`Session: ${input.sessionId}`);
  parts.push("");

  for (const obs of input.observations) {
    parts.push(
      `- [${obs.priority.toUpperCase()}] (turns ${obs.turnNumbers.join(",")}) ${obs.content}`,
    );
  }

  parts.push("");
  parts.push("Please synthesize these observations into higher-level reflections.");

  return parts.join("\n");
}
