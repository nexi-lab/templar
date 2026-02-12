export const PACKAGE_NAME = "@templar/sanitize" as const;

// Constants
export {
  DEFAULT_MAX_INPUT_LENGTH,
  DEFAULT_MAX_MATCH_LENGTH,
} from "./constants.js";
export { createSanitizeMiddleware } from "./middleware.js";

// Rules
export {
  CONTROL_CHAR_RULES,
  DEFAULT_RULES,
  HTML_RULES,
  PROMPT_INJECTION_RULES,
  URL_RULES,
} from "./rules/index.js";
// Core
export { ContentSanitizer } from "./sanitizer.js";
// Types
export type {
  ContentSanitizerConfig,
  SanitizationRule,
  SanitizeOptions,
  SanitizeResult,
  SanitizeViolation,
  ViolationSeverity,
} from "./types.js";
