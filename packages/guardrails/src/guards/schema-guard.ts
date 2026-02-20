import type { z } from "zod";
import { DEFAULT_VALIDATION_TIMEOUT_MS } from "../constants.js";
import type { Guard, GuardContext, GuardResult } from "../types.js";
import { SchemaValidator } from "../validator.js";

/**
 * Guard that validates output against a Zod schema.
 * Supports per-request schema override via `context.metadata.guardrailSchema`.
 */
export class SchemaGuard implements Guard {
  readonly name = "SchemaGuard";
  private readonly validator: SchemaValidator;
  private readonly timeoutMs: number;

  constructor(schema: z.ZodType, timeoutMs?: number) {
    this.timeoutMs = timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS;
    this.validator = new SchemaValidator(schema, this.timeoutMs);
  }

  async validate(context: GuardContext): Promise<GuardResult> {
    const overrideSchema = context.metadata.guardrailSchema as z.ZodType | undefined;

    const validator = overrideSchema
      ? new SchemaValidator(overrideSchema, this.timeoutMs)
      : this.validator;

    const data = extractOutputData(context.response);
    const result = await validator.validate(data, this.name);

    return { valid: result.valid, issues: result.issues };
  }
}

/**
 * Extract the data to validate from the response.
 * For model responses, parse content as JSON if possible.
 * For tool responses, use the output directly.
 */
function extractOutputData(response: unknown): unknown {
  if (response === null || response === undefined) {
    return response;
  }

  if (typeof response === "object" && "content" in response) {
    const content = (response as { content: unknown }).content;
    if (typeof content === "string") {
      try {
        return JSON.parse(content) as unknown;
      } catch {
        return content;
      }
    }
    return content;
  }

  if (typeof response === "object" && "output" in response) {
    return (response as { output: unknown }).output;
  }

  return response;
}
