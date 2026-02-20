/**
 * Cryptographically secure pairing code generation and parsing.
 *
 * Character set: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32 chars, no 0O1I)
 * Format: XXXX-XXXX (dash at midpoint for readability)
 */

import { randomBytes } from "node:crypto";

/** 32-char alphabet — no 0, O, 1, I to prevent visual confusion */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Regex to find a pairing code in message text */
const CODE_PATTERN = /[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}/gi;

export interface GeneratedCode {
  /** Raw code without dash (e.g., "A3K9X2M7") */
  readonly code: string;
  /** Formatted code with dash (e.g., "A3K9-X2M7") */
  readonly formatted: string;
}

/**
 * Generate a cryptographically secure pairing code.
 *
 * Uses crypto.randomBytes() for secure generation with uniform distribution
 * via rejection sampling (alphabet size 32 is a power of 2, so no bias).
 */
export function generatePairingCode(length: number = 8): GeneratedCode {
  const bytes = randomBytes(length);
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    // 32 chars = 5 bits, 256 / 32 = 8 — no rejection needed
    const byte = bytes[i] as number;
    chars.push(ALPHABET[byte & 0x1f] as string);
  }

  const code = chars.join("");
  const mid = Math.floor(length / 2);
  const formatted = `${code.slice(0, mid)}-${code.slice(mid)}`;

  return { code, formatted };
}

/**
 * Normalize a pairing code for matching: strip dashes, uppercase, trim.
 */
export function normalizePairingCode(input: string): string {
  return input.replace(/-/g, "").toUpperCase().trim();
}

/**
 * Extract the first pairing code found in message text.
 * Returns the normalized code (no dash, uppercase) or undefined.
 */
export function extractPairingCode(text: string): string | undefined {
  const match = text.match(CODE_PATTERN);
  if (!match) return undefined;
  return normalizePairingCode(match[0]);
}
