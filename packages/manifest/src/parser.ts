/**
 * Synchronous YAML manifest parser.
 * Interpolates env vars, parses YAML, validates with Zod, and deep-freezes.
 *
 * Governance checks (enabled by default) reject non-declarative constructs
 * like conditionals, loops, template expressions, and inline code.
 */

import type { AgentManifest } from "@templar/core";
import { ManifestGovernanceError, ManifestParseError, ManifestSchemaError } from "@templar/errors";
import { parse as parseYaml, YAMLParseError } from "yaml";

import { deepFreeze } from "./freeze.js";
import { scanRawGovernanceViolations, walkParsedGovernanceViolations } from "./governance.js";
import { interpolateEnvVars } from "./interpolation.js";
import { normalizeManifest } from "./normalize.js";
import { AgentManifestSchema } from "./schema.js";

export interface ParseManifestOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly skipInterpolation?: boolean;
  /** Skip governance checks (conditionals, loops, template expressions). Default: false. */
  readonly skipGovernance?: boolean;
}

/**
 * Parses a YAML string into a validated, frozen AgentManifest.
 *
 * Pipeline:
 * 1. (governance) Scan raw string for template syntax violations
 * 2. (optional) Interpolate `${VAR}` / `${VAR:default}` env vars
 * 3. Parse YAML string
 * 4. (governance) Walk parsed object for semantic key / code injection violations
 * 5. Normalize sugar syntax
 * 6. Validate against Zod schema
 * 7. Deep freeze result
 */
export function parseManifestYaml(
  yamlString: string,
  options?: ParseManifestOptions,
): AgentManifest {
  // Step 1: Governance — string scan (before interpolation, on raw input)
  const governanceEnabled = options?.skipGovernance !== true;
  const rawViolations = governanceEnabled ? scanRawGovernanceViolations(yamlString) : [];

  // Step 2: Interpolation
  const interpolated =
    options?.skipInterpolation === true ? yamlString : interpolateEnvVars(yamlString, options?.env);

  // Step 3: YAML parse
  let parsed: unknown;
  try {
    parsed = parseYaml(interpolated);
  } catch (error: unknown) {
    // If we have governance violations AND a parse error, throw governance first
    // (the parse error may be caused by template syntax)
    if (rawViolations.length > 0) {
      throw new ManifestGovernanceError(rawViolations);
    }
    if (error instanceof YAMLParseError) {
      const pos = error.linePos?.[0];
      throw new ManifestParseError(undefined, error.message, pos?.line, pos?.col, error);
    }
    throw new ManifestParseError(undefined, String(error));
  }

  // Step 4: Governance — AST walk (after parse, before normalization)
  let astViolations: ReturnType<typeof walkParsedGovernanceViolations> = [];
  if (
    governanceEnabled &&
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    astViolations = walkParsedGovernanceViolations(parsed as Record<string, unknown>);
  }

  // Combine and throw if any governance violations
  const allViolations = [...rawViolations, ...astViolations];
  if (allViolations.length > 0) {
    throw new ManifestGovernanceError(allViolations);
  }

  // Step 5-6: Normalize + Zod validation
  const toValidate =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? normalizeManifest(parsed as Record<string, unknown>)
      : parsed;
  const result = AgentManifestSchema.safeParse(toValidate);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ManifestSchemaError(issues, result.error);
  }

  // Step 7: Deep freeze
  return deepFreeze(result.data as AgentManifest);
}
