/**
 * Synchronous YAML manifest parser.
 * Interpolates env vars, parses YAML, validates with Zod, and deep-freezes.
 */

import type { AgentManifest } from "@templar/core";
import { ManifestParseError, ManifestSchemaError } from "@templar/errors";
import { parse as parseYaml, YAMLParseError } from "yaml";

import { deepFreeze } from "./freeze.js";
import { interpolateEnvVars } from "./interpolation.js";
import { normalizeManifest } from "./normalize.js";
import { AgentManifestSchema } from "./schema.js";

export interface ParseManifestOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly skipInterpolation?: boolean;
}

/**
 * Parses a YAML string into a validated, frozen AgentManifest.
 *
 * Pipeline:
 * 1. (optional) Interpolate `${VAR}` / `${VAR:default}` env vars
 * 2. Parse YAML string
 * 3. Validate against Zod schema
 * 4. Deep freeze result
 */
export function parseManifestYaml(
  yamlString: string,
  options?: ParseManifestOptions,
): AgentManifest {
  const interpolated =
    options?.skipInterpolation === true ? yamlString : interpolateEnvVars(yamlString, options?.env);

  let parsed: unknown;
  try {
    parsed = parseYaml(interpolated);
  } catch (error: unknown) {
    if (error instanceof YAMLParseError) {
      const pos = error.linePos?.[0];
      throw new ManifestParseError(undefined, error.message, pos?.line, pos?.col, error);
    }
    throw new ManifestParseError(undefined, String(error));
  }

  const toValidate =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? normalizeManifest(parsed as Record<string, unknown>)
      : parsed;
  const result = AgentManifestSchema.safeParse(toValidate);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ManifestSchemaError(issues, result.error);
  }

  return deepFreeze(result.data as AgentManifest);
}
