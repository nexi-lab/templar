import { CONTROL_CHAR_RULES } from "./control-chars.js";
import { HTML_RULES } from "./html.js";
import { PROMPT_INJECTION_RULES } from "./prompt-injection.js";
import { URL_RULES } from "./url.js";

/** Default rules in recommended execution order */
export const DEFAULT_RULES: readonly import("../types.js").SanitizationRule[] = [
  ...CONTROL_CHAR_RULES,
  ...PROMPT_INJECTION_RULES,
  ...HTML_RULES,
  ...URL_RULES,
];

export { CONTROL_CHAR_RULES, HTML_RULES, PROMPT_INJECTION_RULES, URL_RULES };
