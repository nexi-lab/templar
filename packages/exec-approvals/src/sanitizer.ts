/**
 * Environment variable sanitizer — strips sensitive env vars.
 */

import type { SanitizedEnv } from "./types.js";

/**
 * Sanitizes environment variables by removing those matching sensitive patterns.
 *
 * @param env - The environment variables to sanitize
 * @param patterns - Glob patterns for sensitive variable names (e.g., "*API_KEY*")
 * @returns Sanitized env and list of stripped keys
 */
export function sanitizeEnv(
  env: Readonly<Record<string, string>>,
  patterns: readonly string[],
): SanitizedEnv {
  const regexes = patterns.map(globToRegex);
  const strippedKeys: string[] = [];
  const cleanEnv: Record<string, string> = {};

  for (const key of Object.keys(env)) {
    if (matchesAny(key, regexes)) {
      strippedKeys.push(key);
    } else {
      const value = env[key];
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }
  }

  return {
    env: Object.freeze(cleanEnv),
    strippedKeys,
  };
}

/**
 * Converts a simple glob pattern to a RegExp.
 * Supports: * (matches any characters)
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`, "i");
}

function matchesAny(value: string, regexes: readonly RegExp[]): boolean {
  return regexes.some((r) => r.test(value));
}
