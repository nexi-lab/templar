import type { SanitizationRule, SanitizeViolation } from "../types.js";
import { collectRegexViolations, truncateMatch } from "./utils.js";

/**
 * Decode common HTML entities used to evade detection
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);?/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/**
 * Collect regex violations from both raw and entity-decoded content
 */
function collectWithDecoded(
  content: string,
  pattern: RegExp,
  ruleName: string,
  description: string,
  severity: SanitizeViolation["severity"],
): readonly SanitizeViolation[] {
  const decoded = decodeHtmlEntities(content);
  return [
    ...collectRegexViolations(content, pattern, ruleName, description, severity),
    ...collectRegexViolations(decoded, pattern, ruleName, description, severity),
  ];
}

/**
 * Strip <script> tags including nested evasion like <scr<script>ipt>
 * Iterative to handle cases where stripping reveals new tags
 */
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

const scriptTagRule: SanitizationRule = {
  name: "script-tag",
  description: "Strip <script> tags and their content",
  test(content: string): readonly SanitizeViolation[] {
    return collectWithDecoded(
      content,
      SCRIPT_TAG_PATTERN,
      this.name,
      "Script tag detected",
      "critical",
    );
  },
  strip(content: string): string {
    let result = content;
    let previous: string;
    do {
      previous = result;
      result = result.replace(SCRIPT_TAG_PATTERN, "");
    } while (result !== previous);
    return result;
  },
};

/**
 * Strip event handler attributes (onclick, onerror, onload, etc.)
 */
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

const eventHandlerRule: SanitizationRule = {
  name: "event-handler",
  description: "Strip event handler attributes (onclick, onerror, etc.)",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    EVENT_HANDLER_PATTERN.lastIndex = 0;
    for (
      let match = EVENT_HANDLER_PATTERN.exec(content);
      match !== null;
      match = EVENT_HANDLER_PATTERN.exec(content)
    ) {
      violations.push({
        rule: this.name,
        description: `Event handler attribute detected: ${match[0].split("=")[0]}`,
        severity: "high",
        matched: truncateMatch(match[0]),
        index: match.index,
      });
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(EVENT_HANDLER_PATTERN, "");
  },
};

/**
 * Detect javascript:, vbscript:, data: in href/src attributes
 * Case-insensitive, handles whitespace and entity evasion
 */
const DANGEROUS_PROTOCOL_IN_ATTR_PATTERN =
  /(?:href|src|action)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*')/gi;

const dangerousProtocolAttrRule: SanitizationRule = {
  name: "dangerous-protocol-attr",
  description: "Strip javascript:/vbscript:/data: in href/src attributes",
  test(content: string): readonly SanitizeViolation[] {
    return collectWithDecoded(
      content,
      DANGEROUS_PROTOCOL_IN_ATTR_PATTERN,
      this.name,
      "Dangerous protocol in attribute",
      "critical",
    );
  },
  strip(content: string): string {
    return content.replace(DANGEROUS_PROTOCOL_IN_ATTR_PATTERN, "");
  },
};

/**
 * Strip all HTML tags (content enters LLM context, not DOM)
 * Default: strip ALL tags. Preserves content between tags.
 */
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;

const htmlTagRule: SanitizationRule = {
  name: "html-tag-strip",
  description: "Strip all HTML tags (LLM context, not DOM rendering)",
  test(content: string): readonly SanitizeViolation[] {
    return collectRegexViolations(content, HTML_TAG_PATTERN, this.name, "HTML tag detected", "low");
  },
  strip(content: string): string {
    return content.replace(HTML_TAG_PATTERN, "");
  },
};

export const HTML_RULES: readonly SanitizationRule[] = [
  scriptTagRule,
  eventHandlerRule,
  dangerousProtocolAttrRule,
  htmlTagRule,
];
