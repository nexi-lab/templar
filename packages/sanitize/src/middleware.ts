import type { TemplarMiddleware, TurnContext } from "@templar/core";
import { ContentSanitizer } from "./sanitizer.js";
import type { ContentSanitizerConfig } from "./types.js";

/**
 * Create a TemplarMiddleware that sanitizes turn input content.
 * Sanitization result is attached to context.metadata for audit.
 */
export function createSanitizeMiddleware(config?: ContentSanitizerConfig): TemplarMiddleware {
  const sanitizer = new ContentSanitizer(config);

  return {
    name: "@templar/sanitize",
    async onBeforeTurn(context: TurnContext): Promise<void> {
      if (typeof context.input !== "string") return;

      const result = sanitizer.sanitize(context.input);
      context.input = result.clean;
      context.metadata = {
        ...context.metadata,
        sanitizeResult: result,
      };
    },
  };
}
