import type { ChannelAdapter } from "./types.js";

/**
 * Type guard to check if an object implements the ChannelAdapter interface
 *
 * Performs runtime validation of the ChannelAdapter contract by checking for:
 * - Required string property: name
 * - Required methods: connect, disconnect, send, onMessage
 * - Required property: capabilities
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
  // Check for null/undefined
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const adapter = obj as Record<string, unknown>;

  // Check required string property: name
  if (typeof adapter.name !== "string") {
    return false;
  }

  // Check required methods
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

  // Check required property: capabilities (must be an object)
  if (typeof adapter.capabilities !== "object" || adapter.capabilities === null) {
    return false;
  }

  return true;
}
