/**
 * Environment variable interpolation for YAML manifest strings.
 * Supports `${VAR}` and `${VAR:default}` syntax (Docker Compose convention).
 */

import { ManifestInterpolationError } from "@templar/errors";

const ENV_VAR_REGEX = /\$\{([^}:]+?)(?::([^}]*))?\}/g;

/**
 * Replaces `${VAR}` and `${VAR:default}` tokens in the template string
 * with values from the provided env map.
 *
 * - `${VAR}` — resolved from env; error if missing
 * - `${VAR:fallback}` — resolved from env, falls back to `fallback` if missing
 * - Empty string env value is valid (not treated as missing)
 * - No recursive expansion — values containing `${` are literal
 */
export function interpolateEnvVars(
  template: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const missingVars: string[] = [];

  const result = template.replace(ENV_VAR_REGEX, (_match, name: string, defaultValue?: string) => {
    const value = env[name];

    if (value !== undefined) {
      return value;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    missingVars.push(name);
    return "";
  });

  if (missingVars.length > 0) {
    throw new ManifestInterpolationError(missingVars);
  }

  return result;
}
