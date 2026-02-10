/**
 * Secret and PII redaction for audit events.
 *
 * Provides built-in regex patterns for common secrets (Bearer tokens,
 * API keys, connection strings) and PII (email, phone, SSN).
 * User-extensible via customRedactionPatterns config.
 */

import type { RedactionPattern } from "./types.js";

// ============================================================================
// BUILT-IN SECRET PATTERNS
// ============================================================================

/**
 * Built-in patterns for common secrets.
 * Applied when `redactSecrets: true` (default).
 */
export const BUILT_IN_SECRET_PATTERNS: readonly RedactionPattern[] = [
  {
    name: "bearer_token",
    pattern: /Bearer\s+[\w\-._~+/]+=*/gi,
  },
  {
    name: "sk_api_key",
    pattern: /sk-[a-zA-Z0-9]{20,}/gi,
  },
  {
    name: "postgres_url",
    pattern: /postgres(?:ql)?:\/\/[^\s"']+/gi,
  },
  {
    name: "mysql_url",
    pattern: /mysql:\/\/[^\s"']+/gi,
  },
  {
    name: "mongodb_url",
    pattern: /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
  },
  {
    name: "redis_url",
    pattern: /redis:\/\/[^\s"']+/gi,
  },
  {
    name: "pem_private_key",
    pattern: /-----BEGIN [A-Z\s]*PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]*PRIVATE KEY-----/gi,
  },
  {
    name: "aws_access_key",
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/gi,
  },
  {
    name: "aws_secret_key",
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*[A-Za-z0-9/+=]{40}/gi,
  },
  {
    name: "generic_password",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{8,}["']?/gi,
  },
];

// ============================================================================
// PII PATTERNS (HIPAA)
// ============================================================================

/**
 * PII detection patterns — only active at HIPAA compliance level.
 */
export const PII_PATTERNS: readonly RedactionPattern[] = [
  {
    name: "email",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    replacement: "[EMAIL_REDACTED]",
  },
  {
    name: "us_phone",
    pattern: /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  {
    name: "date_of_birth",
    pattern: /\b(?:DOB|date\s*of\s*birth)\s*[=:]\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    replacement: "[DOB_REDACTED]",
  },
];

// ============================================================================
// REDACTION FUNCTIONS
// ============================================================================

const DEFAULT_REPLACEMENT = "[REDACTED]";

/**
 * Apply redaction patterns to a text string.
 *
 * Each pattern is applied sequentially. For each match, the replacement
 * text is used (defaulting to "[REDACTED]").
 *
 * @param text - Text to redact
 * @param patterns - Ordered list of redaction patterns
 * @returns Redacted text
 */
export function redactSecrets(text: string, patterns: readonly RedactionPattern[]): string {
  let result = text;
  for (const { pattern, replacement } of patterns) {
    // Reset regex lastIndex for global patterns
    const regex = new RegExp(pattern.source, pattern.flags);
    result = result.replace(regex, replacement ?? DEFAULT_REPLACEMENT);
  }
  return result;
}

/**
 * Truncate a string to a maximum byte size, appending a marker.
 *
 * @param text - Text to truncate
 * @param maxSize - Maximum size in bytes
 * @returns Truncated text or original if within limit
 */
export function truncatePayload(text: string, maxSize: number): string {
  if (text.length <= maxSize) {
    return text;
  }
  return `${text.slice(0, maxSize)}...[TRUNCATED]`;
}

/**
 * Serialize a value to JSON, truncate, then redact.
 *
 * This is the primary entry point for audit event serialization.
 * Redaction happens lazily at write time (not at event creation).
 *
 * @param payload - Value to serialize (must be JSON-serializable)
 * @param patterns - Redaction patterns to apply
 * @param maxSize - Maximum payload size in bytes before truncation
 * @returns Redacted, truncated JSON string
 */
export function serializeAndRedact(
  payload: unknown,
  patterns: readonly RedactionPattern[],
  maxSize: number,
): string {
  let serialized: string;
  try {
    // JSON.stringify returns undefined for undefined/function/symbol inputs
    const result = JSON.stringify(payload);
    serialized = result ?? String(payload);
  } catch {
    // Handle circular references or non-serializable values
    serialized = String(payload);
  }

  // Truncate first (bounds the cost of redaction)
  const truncated = truncatePayload(serialized, maxSize);

  // Then redact
  return redactSecrets(truncated, patterns);
}

/**
 * Build the complete set of redaction patterns based on config.
 *
 * @param redactSecrets - Whether to include built-in secret patterns
 * @param detectPII - Whether to include PII patterns (HIPAA)
 * @param customPatterns - User-provided additional patterns
 * @returns Combined array of patterns to apply
 */
export function buildRedactionPatterns(
  redactSecrets: boolean,
  detectPII: boolean,
  customPatterns: readonly RedactionPattern[],
): readonly RedactionPattern[] {
  const patterns: RedactionPattern[] = [];

  if (redactSecrets) {
    patterns.push(...BUILT_IN_SECRET_PATTERNS);
  }

  if (detectPII) {
    patterns.push(...PII_PATTERNS);
  }

  patterns.push(...customPatterns);

  return patterns;
}
