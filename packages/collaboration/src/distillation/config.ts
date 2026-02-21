/**
 * Configuration validation and resolution for DistillationMiddleware.
 */

import { CollaborationConfigurationError } from "@templar/errors";
import {
  DEFAULT_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_SCOPE,
} from "./constants.js";
import { DefaultMemoryExtractor } from "./default-extractor.js";
import type { DistillationConfig, ResolvedDistillationConfig } from "./types.js";

/**
 * Validate and resolve DistillationConfig.
 */
export function resolveDistillationConfig(
  config: DistillationConfig,
): ResolvedDistillationConfig {
  // Validate nexusClient
  if (!config.nexusClient) {
    throw new CollaborationConfigurationError("nexusClient is required for Distillation");
  }

  // Validate maxTurns
  if (config.maxTurns !== undefined) {
    if (!Number.isInteger(config.maxTurns) || config.maxTurns <= 0) {
      throw new CollaborationConfigurationError(
        `maxTurns must be a positive integer, got ${config.maxTurns}`,
      );
    }
  }

  // Validate extractionTimeoutMs
  if (config.extractionTimeoutMs !== undefined) {
    if (!Number.isFinite(config.extractionTimeoutMs) || config.extractionTimeoutMs <= 0) {
      throw new CollaborationConfigurationError(
        `extractionTimeoutMs must be a positive number, got ${config.extractionTimeoutMs}`,
      );
    }
  }

  // Validate minConfidence
  if (config.minConfidence !== undefined) {
    if (
      !Number.isFinite(config.minConfidence) ||
      config.minConfidence < 0 ||
      config.minConfidence > 1
    ) {
      throw new CollaborationConfigurationError(
        `minConfidence must be between 0 and 1, got ${config.minConfidence}`,
      );
    }
  }

  // Validate triggers
  const triggers = config.triggers ?? ["session_end"];
  const validTriggers = new Set(["session_end", "context_compact"]);
  for (const trigger of triggers) {
    if (!validTriggers.has(trigger)) {
      throw new CollaborationConfigurationError(
        `Invalid trigger "${trigger}". Valid: session_end, context_compact`,
      );
    }
  }

  return {
    nexusClient: config.nexusClient,
    triggers,
    extractor: config.extractor ?? new DefaultMemoryExtractor(),
    maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
    extractionTimeoutMs: config.extractionTimeoutMs ?? DEFAULT_EXTRACTION_TIMEOUT_MS,
    minConfidence: config.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
    scope: config.scope ?? DEFAULT_SCOPE,
  };
}
