import { GuardrailConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveGuardrailsConfig } from "../../config.js";
import type { Guard } from "../../types.js";

const dummyGuard: Guard = {
  name: "dummy",
  validate: () => ({ valid: true, issues: [] }),
};

describe("resolveGuardrailsConfig", () => {
  it("throws on empty guards and no schema", () => {
    expect(() => resolveGuardrailsConfig({ guards: [] })).toThrow(GuardrailConfigurationError);
  });

  it("accepts empty guards when schema is provided", () => {
    const config = resolveGuardrailsConfig({
      guards: [],
      schema: z.object({ x: z.number() }),
    });
    expect(config.guards).toHaveLength(0);
    expect(config.schema).toBeDefined();
  });

  it("throws on invalid maxRetries", () => {
    expect(() => resolveGuardrailsConfig({ guards: [dummyGuard], maxRetries: -1 })).toThrow(
      GuardrailConfigurationError,
    );

    expect(() => resolveGuardrailsConfig({ guards: [dummyGuard], maxRetries: 11 })).toThrow(
      GuardrailConfigurationError,
    );

    expect(() => resolveGuardrailsConfig({ guards: [dummyGuard], maxRetries: 1.5 })).toThrow(
      GuardrailConfigurationError,
    );
  });

  it("throws on invalid validationTimeoutMs", () => {
    expect(() => resolveGuardrailsConfig({ guards: [dummyGuard], validationTimeoutMs: 0 })).toThrow(
      GuardrailConfigurationError,
    );

    expect(() =>
      resolveGuardrailsConfig({ guards: [dummyGuard], validationTimeoutMs: -100 }),
    ).toThrow(GuardrailConfigurationError);
  });

  it("applies defaults for omitted fields", () => {
    const config = resolveGuardrailsConfig({ guards: [dummyGuard] });

    expect(config.maxRetries).toBe(2);
    expect(config.onFailure).toBe("retry");
    expect(config.executionStrategy).toBe("sequential");
    expect(config.validationTimeoutMs).toBe(5000);
    expect(config.validateModelCalls).toBe(true);
    expect(config.validateToolCalls).toBe(false);
    expect(config.validateTurns).toBe(false);
    expect(config.onWarning).toBeUndefined();
  });

  it("preserves user-provided values", () => {
    const config = resolveGuardrailsConfig({
      guards: [dummyGuard],
      maxRetries: 5,
      onFailure: "throw",
      executionStrategy: "parallel",
      validationTimeoutMs: 10_000,
      validateModelCalls: false,
      validateToolCalls: true,
      validateTurns: true,
    });

    expect(config.maxRetries).toBe(5);
    expect(config.onFailure).toBe("throw");
    expect(config.executionStrategy).toBe("parallel");
    expect(config.validationTimeoutMs).toBe(10_000);
    expect(config.validateModelCalls).toBe(false);
    expect(config.validateToolCalls).toBe(true);
    expect(config.validateTurns).toBe(true);
  });
});
