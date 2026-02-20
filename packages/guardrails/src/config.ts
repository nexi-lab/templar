import { GuardrailConfigurationError } from "@templar/errors";
import {
  DEFAULT_EXECUTION_STRATEGY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_ON_FAILURE,
  DEFAULT_VALIDATION_TIMEOUT_MS,
} from "./constants.js";
import type { GuardrailsConfig, ResolvedGuardrailsConfig } from "./types.js";

const MAX_RETRIES_UPPER_BOUND = 10;

/**
 * Validates and resolves a {@link GuardrailsConfig} into a fully-resolved config
 * with all defaults applied. Throws {@link GuardrailConfigurationError} on invalid input.
 */
export function resolveGuardrailsConfig(config: GuardrailsConfig): ResolvedGuardrailsConfig {
  if (config.guards.length === 0 && config.schema === undefined) {
    throw new GuardrailConfigurationError("At least one guard or a schema must be provided");
  }

  if (config.maxRetries !== undefined) {
    if (
      !Number.isInteger(config.maxRetries) ||
      config.maxRetries < 0 ||
      config.maxRetries > MAX_RETRIES_UPPER_BOUND
    ) {
      throw new GuardrailConfigurationError(
        `maxRetries must be an integer between 0 and ${MAX_RETRIES_UPPER_BOUND}, got ${config.maxRetries}`,
      );
    }
  }

  if (config.validationTimeoutMs !== undefined) {
    if (!Number.isFinite(config.validationTimeoutMs) || config.validationTimeoutMs <= 0) {
      throw new GuardrailConfigurationError(
        `validationTimeoutMs must be a positive number, got ${config.validationTimeoutMs}`,
      );
    }
  }

  return {
    guards: config.guards,
    schema: config.schema,
    onFailure: config.onFailure ?? DEFAULT_ON_FAILURE,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    executionStrategy: config.executionStrategy ?? DEFAULT_EXECUTION_STRATEGY,
    validationTimeoutMs: config.validationTimeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
    validateModelCalls: config.validateModelCalls ?? true,
    validateToolCalls: config.validateToolCalls ?? false,
    validateTurns: config.validateTurns ?? false,
    onWarning: config.onWarning,
  };
}
