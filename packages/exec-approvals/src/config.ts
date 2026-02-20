/**
 * Configuration validation and resolution.
 */

import { ExecApprovalConfigurationError } from "@templar/errors";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_AUTO_PROMOTE_THRESHOLD,
  DEFAULT_MAX_PATTERNS,
  DEFAULT_SENSITIVE_ENV_PATTERNS,
  DEFAULT_TOOL_NAMES,
} from "./constants.js";
import { createRegistry } from "./registry.js";
import type { ExecApprovalsConfig, ResolvedExecApprovalsConfig } from "./types.js";

const MAX_THRESHOLD_UPPER_BOUND = 100;
const MAX_PATTERNS_UPPER_BOUND = 10_000;

/**
 * Validates and resolves an {@link ExecApprovalsConfig} into a fully-resolved
 * config with all defaults applied.
 *
 * @throws {ExecApprovalConfigurationError} on invalid input
 */
export function resolveExecApprovalsConfig(
  config: ExecApprovalsConfig,
): ResolvedExecApprovalsConfig {
  // Validate autoPromoteThreshold
  if (config.autoPromoteThreshold !== undefined) {
    if (
      !Number.isInteger(config.autoPromoteThreshold) ||
      config.autoPromoteThreshold < 1 ||
      config.autoPromoteThreshold > MAX_THRESHOLD_UPPER_BOUND
    ) {
      throw new ExecApprovalConfigurationError(
        `autoPromoteThreshold must be an integer between 1 and ${MAX_THRESHOLD_UPPER_BOUND}, got ${config.autoPromoteThreshold}`,
      );
    }
  }

  // Validate maxPatterns
  if (config.maxPatterns !== undefined) {
    if (
      !Number.isInteger(config.maxPatterns) ||
      config.maxPatterns < 1 ||
      config.maxPatterns > MAX_PATTERNS_UPPER_BOUND
    ) {
      throw new ExecApprovalConfigurationError(
        `maxPatterns must be an integer between 1 and ${MAX_PATTERNS_UPPER_BOUND}, got ${config.maxPatterns}`,
      );
    }
  }

  // Build the safe binary registry
  const safeBinaries = createRegistry(config.safeBinaries ?? [], config.removeSafeBinaries ?? []);

  // Build tool names set
  const toolNames = new Set<string>([...DEFAULT_TOOL_NAMES, ...(config.toolNames ?? [])]);

  return {
    safeBinaries,
    autoPromoteThreshold: config.autoPromoteThreshold ?? DEFAULT_AUTO_PROMOTE_THRESHOLD,
    maxPatterns: config.maxPatterns ?? DEFAULT_MAX_PATTERNS,
    sensitiveEnvPatterns: config.sensitiveEnvPatterns ?? DEFAULT_SENSITIVE_ENV_PATTERNS,
    ...(config.onApprovalRequest ? { onApprovalRequest: config.onApprovalRequest } : {}),
    agentId: config.agentId ?? DEFAULT_AGENT_ID,
    toolNames: Object.freeze(toolNames),
  };
}
