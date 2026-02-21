/**
 * Parse human-readable duration strings to milliseconds.
 *
 * Supported formats: "0s", "10m", "1h", "2d"
 */

const UNITS: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a duration string like "10m" or "1h" to milliseconds.
 * Throws if the format is invalid.
 */
export function parseDuration(input: string): number {
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid duration format "${input}". Expected "<number><s|m|h|d>", e.g. "10m", "1h".`,
    );
  }

  const rawValue = match[1];
  const unit = match[2];

  if (rawValue === undefined || unit === undefined) {
    throw new Error(
      `Invalid duration format "${input}". Expected "<number><s|m|h|d>", e.g. "10m", "1h".`,
    );
  }

  const value = Number.parseFloat(rawValue);
  const multiplier = UNITS[unit];

  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit "${unit}".`);
  }

  const result = value * multiplier;

  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`Duration value out of range: "${input}".`);
  }

  return result;
}
