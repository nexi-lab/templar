import type { z } from "zod";
import type { GuardIssue, SchemaValidationResult } from "./types.js";

/**
 * Wraps a Zod schema and validates data with a configurable timeout.
 */
export class SchemaValidator {
  private readonly schema: z.ZodType;
  private readonly timeoutMs: number;

  constructor(schema: z.ZodType, timeoutMs: number) {
    this.schema = schema;
    this.timeoutMs = timeoutMs;
  }

  async validate(data: unknown, guardName: string): Promise<SchemaValidationResult> {
    const result = await Promise.race([this.runValidation(data, guardName), this.timeoutPromise()]);
    return result;
  }

  private async runValidation(data: unknown, guardName: string): Promise<SchemaValidationResult> {
    const result = await this.schema.safeParseAsync(data);

    if (result.success) {
      return { valid: true, issues: [] };
    }

    const issues: readonly GuardIssue[] = result.error.issues.map((issue) => ({
      guard: guardName,
      path: issue.path,
      message: issue.message,
      code: String(issue.code),
      severity: "error" as const,
    }));

    return { valid: false, issues };
  }

  private timeoutPromise(): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Schema validation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });
  }
}
