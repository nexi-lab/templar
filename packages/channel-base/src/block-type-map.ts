import type { CapabilityKey, ContentBlock } from "@templar/core";

/**
 * Maps content block type discriminant to the capability key that gates it
 */
export const BLOCK_TYPE_TO_CAPABILITY: Readonly<Record<ContentBlock["type"], CapabilityKey>> = {
  text: "text",
  image: "images",
  file: "files",
  button: "buttons",
} as const;
