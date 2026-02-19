/**
 * Parsing utilities for observer and reflector LLM output.
 *
 * Handles well-formed, malformed, and empty LLM responses gracefully.
 */

import type { Observation, ObservationPriority, Reflection } from "./types.js";

// ---------------------------------------------------------------------------
// Observation parsing
// ---------------------------------------------------------------------------

/**
 * Parse LLM output into Observation[].
 *
 * Expected format per line:
 *   PRIORITY | TURN_NUMBERS | observation content
 *
 * Lines that don't match are silently skipped (graceful degradation).
 */
export function parseObservations(llmOutput: string, timestamp: string): readonly Observation[] {
  if (!llmOutput.trim()) {
    return [];
  }

  const lines = llmOutput.split("\n").filter((line) => line.trim().length > 0);
  const observations: Observation[] = [];

  for (const line of lines) {
    const parsed = parseObservationLine(line.trim(), timestamp);
    if (parsed !== undefined) {
      observations.push(parsed);
    }
  }

  return observations;
}

/**
 * Parse a single observation line.
 * Returns undefined if the line doesn't match the expected format.
 */
function parseObservationLine(line: string, timestamp: string): Observation | undefined {
  // Split on first two pipes to preserve content with embedded pipes
  const firstPipe = line.indexOf("|");
  if (firstPipe === -1) return undefined;

  const secondPipe = line.indexOf("|", firstPipe + 1);
  if (secondPipe === -1) return undefined;

  const priorityRaw = line.slice(0, firstPipe).trim().toUpperCase();
  const turnNumbersRaw = line.slice(firstPipe + 1, secondPipe).trim();
  const content = line.slice(secondPipe + 1).trim();

  if (!content) {
    return undefined;
  }

  const priority = parsePriority(priorityRaw);
  if (priority === undefined) {
    return undefined;
  }

  const turnNumbers = parseTurnNumbers(turnNumbersRaw);

  return {
    timestamp,
    priority,
    content,
    sourceType: "turn",
    turnNumbers,
  };
}

/**
 * Parse priority string into ObservationPriority.
 */
function parsePriority(raw: string): ObservationPriority | undefined {
  switch (raw) {
    case "CRITICAL":
      return "critical";
    case "IMPORTANT":
      return "important";
    case "INFORMATIONAL":
      return "informational";
    default:
      return undefined;
  }
}

/**
 * Parse comma-separated turn numbers.
 */
function parseTurnNumbers(raw: string): readonly number[] {
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// ---------------------------------------------------------------------------
// Reflection parsing
// ---------------------------------------------------------------------------

/**
 * Parse LLM output into Reflection[].
 *
 * Expected format per line:
 *   REFLECTION | insight content
 *
 * Lines that don't match are silently skipped.
 */
export function parseReflections(
  llmOutput: string,
  timestamp: string,
  sourceObservationCount: number,
): readonly Reflection[] {
  if (!llmOutput.trim()) {
    return [];
  }

  const lines = llmOutput.split("\n").filter((line) => line.trim().length > 0);
  const reflections: Reflection[] = [];

  for (const line of lines) {
    const parsed = parseReflectionLine(line.trim(), timestamp, sourceObservationCount);
    if (parsed !== undefined) {
      reflections.push(parsed);
    }
  }

  return reflections;
}

/**
 * Parse a single reflection line.
 */
function parseReflectionLine(
  line: string,
  timestamp: string,
  sourceObservationCount: number,
): Reflection | undefined {
  const pipeIdx = line.indexOf("|");
  if (pipeIdx === -1) {
    return undefined;
  }

  const marker = line.slice(0, pipeIdx).trim().toUpperCase();
  if (marker !== "REFLECTION") {
    return undefined;
  }

  const insight = line.slice(pipeIdx + 1).trim();
  if (!insight) {
    return undefined;
  }

  return {
    timestamp,
    insight,
    sourceObservationCount,
  };
}
