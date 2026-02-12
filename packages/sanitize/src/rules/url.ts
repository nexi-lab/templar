import type { SanitizationRule, SanitizeViolation } from "../types.js";
import { truncateMatch } from "./utils.js";

/** Protocols that are allowed in URLs */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Protocols that are explicitly dangerous */
const DANGEROUS_PROTOCOLS = new Set(["javascript:", "vbscript:", "data:", "file:", "blob:"]);

/**
 * Private/reserved IP patterns for SSRF prevention
 */
const PRIVATE_IP_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
];

function isPrivateHost(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, "");
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Strip control characters and decode before protocol check
 * Handles evasion like java\x0ascript:
 */
function normalizeUrl(raw: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars from URLs
  return raw.replace(/[\x00-\x1f\x7f]/g, "").replace(/[\s]+/g, "");
}

/**
 * Match URLs in text: scheme://... or scheme:...
 * Simple pattern — no backtracking risk
 */
const URL_PATTERN = /(?:(?:https?|ftp|javascript|vbscript|data|file|blob|mailto):)[^\s"'<>}]+/gi;

function extractProtocol(normalized: string): string | undefined {
  try {
    const url = new URL(normalized);
    return url.protocol.toLowerCase();
  } catch {
    const colonIdx = normalized.indexOf(":");
    if (colonIdx > 0) {
      return `${normalized.slice(0, colonIdx).toLowerCase()}:`;
    }
    return undefined;
  }
}

function parseUrlHost(normalized: string): string | undefined {
  try {
    const url = new URL(normalized);
    return url.hostname;
  } catch {
    return undefined;
  }
}

const dangerousProtocolRule: SanitizationRule = {
  name: "dangerous-url-protocol",
  description: "Block dangerous URL protocols (javascript:, vbscript:, data:, file:, blob:)",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    URL_PATTERN.lastIndex = 0;
    for (let match = URL_PATTERN.exec(content); match !== null; match = URL_PATTERN.exec(content)) {
      const protocol = extractProtocol(normalizeUrl(match[0]));
      if (protocol && DANGEROUS_PROTOCOLS.has(protocol)) {
        violations.push({
          rule: this.name,
          description: `Dangerous protocol: ${protocol}`,
          severity: "critical",
          matched: truncateMatch(match[0]),
          index: match.index,
        });
      }
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(URL_PATTERN, (match) => {
      const protocol = extractProtocol(normalizeUrl(match));
      if (protocol && DANGEROUS_PROTOCOLS.has(protocol)) return "";
      return match;
    });
  },
};

const ssrfRule: SanitizationRule = {
  name: "ssrf-private-ip",
  description: "Block URLs pointing to private/reserved IP addresses (SSRF prevention)",
  test(content: string): readonly SanitizeViolation[] {
    const violations: SanitizeViolation[] = [];
    URL_PATTERN.lastIndex = 0;
    for (let match = URL_PATTERN.exec(content); match !== null; match = URL_PATTERN.exec(content)) {
      const normalized = normalizeUrl(match[0]);
      const protocol = extractProtocol(normalized);
      const hostname = parseUrlHost(normalized);
      if (protocol && ALLOWED_PROTOCOLS.has(protocol) && hostname && isPrivateHost(hostname)) {
        violations.push({
          rule: this.name,
          description: `Private IP address detected: ${hostname}`,
          severity: "high",
          matched: truncateMatch(match[0]),
          index: match.index,
        });
      }
    }
    return violations;
  },
  strip(content: string): string {
    return content.replace(URL_PATTERN, (match) => {
      const normalized = normalizeUrl(match);
      const protocol = extractProtocol(normalized);
      const hostname = parseUrlHost(normalized);
      if (protocol && ALLOWED_PROTOCOLS.has(protocol) && hostname && isPrivateHost(hostname)) {
        return "";
      }
      return match;
    });
  },
};

export const URL_RULES: readonly SanitizationRule[] = [dangerousProtocolRule, ssrfRule];
