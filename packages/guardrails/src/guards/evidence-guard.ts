import type { Guard, GuardContext, GuardIssue, GuardResult } from "../types.js";

export interface EvidenceGuardConfig {
  readonly requiredFields: readonly string[];
  readonly minEvidence?: number;
}

/**
 * Guard that validates output contains required evidence fields.
 * Checks for required fields with optional minimum count per field.
 */
export class EvidenceGuard implements Guard {
  readonly name = "EvidenceGuard";
  private readonly requiredFields: readonly string[];
  private readonly minEvidence: number;

  constructor(config: EvidenceGuardConfig) {
    this.requiredFields = config.requiredFields;
    this.minEvidence = config.minEvidence ?? 1;
  }

  validate(context: GuardContext): GuardResult {
    const data = extractData(context.response);

    if (data === null || typeof data !== "object") {
      return {
        valid: false,
        issues: [
          {
            guard: this.name,
            path: [],
            message: "Output is not an object; cannot check evidence fields",
            code: "EVIDENCE_MISSING",
            severity: "error",
          },
        ],
      };
    }

    const record = data as Record<string, unknown>;
    const issues: GuardIssue[] = [];

    for (const field of this.requiredFields) {
      const value = record[field];

      if (value === undefined || value === null) {
        issues.push({
          guard: this.name,
          path: [field],
          message: `Required evidence field "${field}" is missing`,
          code: "EVIDENCE_MISSING",
          severity: "error",
        });
        continue;
      }

      if (Array.isArray(value) && value.length < this.minEvidence) {
        issues.push({
          guard: this.name,
          path: [field],
          message: `Evidence field "${field}" has ${value.length} items, minimum is ${this.minEvidence}`,
          code: "EVIDENCE_MISSING",
          severity: "error",
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }
}

function extractData(response: unknown): unknown {
  if (response === null || response === undefined) {
    return null;
  }

  if (typeof response === "string") {
    try {
      return JSON.parse(response) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof response === "object" && "content" in response) {
    const content = (response as { content: unknown }).content;
    if (typeof content === "string") {
      try {
        return JSON.parse(content) as unknown;
      } catch {
        return null;
      }
    }
    return content;
  }

  if (typeof response === "object" && "output" in response) {
    return (response as { output: unknown }).output;
  }

  return response;
}
