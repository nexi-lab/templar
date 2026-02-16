import type { ChannelAdapter, ChannelCapabilities } from "@templar/core";

// Capability keys that require only `supported: true` (no extra constraints)
const SIMPLE_CAPABILITY_KEYS = ["reactions", "typingIndicator", "readReceipts"] as const;

// Capability keys that require `supported: true` + specific constraint fields
const CONSTRAINED_CAPABILITY_VALIDATORS: Record<string, (cap: Record<string, unknown>) => boolean> =
  {
    text: (cap) => typeof cap.maxLength === "number" && cap.maxLength > 0,
    richText: (cap) => Array.isArray(cap.formats) && cap.formats.length > 0,
    images: (cap) =>
      typeof cap.maxSize === "number" &&
      cap.maxSize > 0 &&
      Array.isArray(cap.formats) &&
      cap.formats.length > 0,
    files: (cap) => typeof cap.maxSize === "number" && cap.maxSize > 0,
    buttons: (cap) => typeof cap.maxButtons === "number" && cap.maxButtons > 0,
    threads: (cap) => typeof cap.nested === "boolean",
    voiceMessages: (cap) =>
      typeof cap.maxDuration === "number" &&
      cap.maxDuration > 0 &&
      Array.isArray(cap.formats) &&
      cap.formats.length > 0,
    realTimeVoice: (cap) =>
      Array.isArray(cap.codecs) &&
      cap.codecs.length > 0 &&
      Array.isArray(cap.sampleRates) &&
      cap.sampleRates.length > 0 &&
      typeof cap.duplex === "boolean" &&
      typeof cap.maxParticipants === "number" &&
      cap.maxParticipants > 0,
    groups: (cap) => typeof cap.maxMembers === "number" && cap.maxMembers > 0,
  };

/**
 * Type guard to validate the grouped ChannelCapabilities structure.
 *
 * Each present capability group must have `supported: true` and its
 * required constraint fields. Absent keys are valid (means unsupported).
 *
 * @param obj - Object to validate
 * @returns true if obj is a valid ChannelCapabilities
 */
export function isChannelCapabilities(obj: unknown): obj is ChannelCapabilities {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const caps = obj as Record<string, unknown>;

  // Validate simple capability groups (only need supported: true)
  for (const key of SIMPLE_CAPABILITY_KEYS) {
    const value = caps[key];
    if (value === undefined) continue;
    if (typeof value !== "object" || value === null) return false;
    if ((value as Record<string, unknown>).supported !== true) return false;
  }

  // Validate constrained capability groups
  for (const [key, validate] of Object.entries(CONSTRAINED_CAPABILITY_VALIDATORS)) {
    const value = caps[key];
    if (value === undefined) continue;
    if (typeof value !== "object" || value === null) return false;
    const group = value as Record<string, unknown>;
    if (group.supported !== true) return false;
    if (!validate(group)) return false;
  }

  return true;
}

/**
 * Type guard to check if an object implements the ChannelAdapter interface
 *
 * Performs runtime validation of the ChannelAdapter contract by checking for:
 * - Required string property: name
 * - Required methods: connect, disconnect, send, onMessage
 * - Required property: capabilities (validated via isChannelCapabilities)
 *
 * This is used by ChannelRegistry to validate dynamically loaded adapters
 * and ensure they conform to the expected interface.
 *
 * @param obj - Object to validate
 * @returns true if obj implements ChannelAdapter interface
 *
 * @example
 * ```typescript
 * const adapter = await import('@templar/channel-slack');
 * if (isChannelAdapter(adapter.default)) {
 *   await adapter.default.connect();
 * }
 * ```
 */
export function isChannelAdapter(obj: unknown): obj is ChannelAdapter {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const adapter = obj as Record<string, unknown>;

  if (typeof adapter.name !== "string") {
    return false;
  }

  if (typeof adapter.connect !== "function") {
    return false;
  }

  if (typeof adapter.disconnect !== "function") {
    return false;
  }

  if (typeof adapter.send !== "function") {
    return false;
  }

  if (typeof adapter.onMessage !== "function") {
    return false;
  }

  if (!isChannelCapabilities(adapter.capabilities)) {
    return false;
  }

  return true;
}
