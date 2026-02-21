/**
 * Configuration validation and resolution.
 */

import { HeartbeatConfigurationError } from "@templar/errors";
import { defaultClock } from "./clock.js";
import {
  DEFAULT_DIAGNOSTICS_BUFFER_SIZE,
  DEFAULT_EVALUATOR_TIMEOUT_MS,
  DEFAULT_INTERVAL_MS,
} from "./constants.js";
import type { HeartbeatConfig, ResolvedHeartbeatConfig } from "./types.js";

/**
 * Validates and resolves a {@link HeartbeatConfig} into a fully-resolved
 * config with all defaults applied.
 *
 * @throws {HeartbeatConfigurationError} on invalid input
 */
export function resolveHeartbeatConfig(config: HeartbeatConfig = {}): ResolvedHeartbeatConfig {
  if (config.intervalMs !== undefined) {
    if (!Number.isFinite(config.intervalMs) || config.intervalMs <= 0) {
      throw new HeartbeatConfigurationError(
        `intervalMs must be a positive number, got ${config.intervalMs}`,
      );
    }
  }

  if (config.evaluatorTimeoutMs !== undefined) {
    if (!Number.isFinite(config.evaluatorTimeoutMs) || config.evaluatorTimeoutMs <= 0) {
      throw new HeartbeatConfigurationError(
        `evaluatorTimeoutMs must be a positive number, got ${config.evaluatorTimeoutMs}`,
      );
    }
  }

  if (config.diagnosticsBufferSize !== undefined) {
    if (!Number.isInteger(config.diagnosticsBufferSize) || config.diagnosticsBufferSize <= 0) {
      throw new HeartbeatConfigurationError(
        `diagnosticsBufferSize must be a positive integer, got ${config.diagnosticsBufferSize}`,
      );
    }
  }

  return {
    intervalMs: config.intervalMs ?? DEFAULT_INTERVAL_MS,
    evaluators: config.evaluators ?? [],
    evaluatorTimeoutMs: config.evaluatorTimeoutMs ?? DEFAULT_EVALUATOR_TIMEOUT_MS,
    diagnosticsBufferSize: config.diagnosticsBufferSize ?? DEFAULT_DIAGNOSTICS_BUFFER_SIZE,
    ...(config.nexusClient ? { nexusClient: config.nexusClient } : {}),
    clock: config.clock ?? defaultClock,
    ...(config.onTick ? { onTick: config.onTick } : {}),
  };
}
