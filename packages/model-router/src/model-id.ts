import type { ModelId, ModelRef, ModelSelection } from "./types.js";

/**
 * Parse a "provider:model" string into its components.
 * Throws if the format is invalid.
 */
export function parseModelId(id: ModelId): { provider: string; model: string } {
  const colonIndex = id.indexOf(":");
  if (colonIndex <= 0 || colonIndex === id.length - 1) {
    throw new Error(`Invalid ModelId format: "${id}". Expected "provider:model".`);
  }
  return {
    provider: id.slice(0, colonIndex),
    model: id.slice(colonIndex + 1),
  };
}

/**
 * Normalize a ModelSelection (string or ModelRef) into a canonical ModelRef.
 */
export function normalizeModelSelection(selection: ModelSelection): ModelRef {
  if (typeof selection === "string") {
    const { provider, model } = parseModelId(selection);
    return { provider, model };
  }
  return selection;
}

/**
 * Format a ModelRef back to "provider:model" string form.
 */
export function formatModelId(ref: ModelRef): ModelId {
  return `${ref.provider}:${ref.model}`;
}
