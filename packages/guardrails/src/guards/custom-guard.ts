import type { Guard, GuardContext, GuardResult } from "../types.js";

/**
 * Creates a custom guard from a validation function.
 */
export function createCustomGuard(
  name: string,
  validateFn: (context: GuardContext) => GuardResult | Promise<GuardResult>,
): Guard {
  return {
    name,
    validate: validateFn,
  };
}
