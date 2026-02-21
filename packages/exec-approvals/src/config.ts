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
const MIN_POLICY_TIMEOUT = 100;
const MAX_POLICY_TIMEOUT = 30_000;
const DEFAULT_POLICY_TIMEOUT = 3_000;
const MAX_SYNC_INTERVAL = 300_000;
const DEFAULT_SYNC_INTERVAL = 0;

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

  // Validate policyTimeout
  if (config.policyTimeout !== undefined) {
    if (
      !Number.isInteger(config.policyTimeout) ||
      config.policyTimeout < MIN_POLICY_TIMEOUT ||
      config.policyTimeout > MAX_POLICY_TIMEOUT
    ) {
      throw new ExecApprovalConfigurationError(
        `policyTimeout must be an integer between ${MIN_POLICY_TIMEOUT} and ${MAX_POLICY_TIMEOUT}, got ${config.policyTimeout}`,
      );
    }
  }

  // Validate allowlistSyncInterval
  if (config.allowlistSyncInterval !== undefined) {
    if (
      !Number.isInteger(config.allowlistSyncInterval) ||
      config.allowlistSyncInterval < 0 ||
      config.allowlistSyncInterval > MAX_SYNC_INTERVAL
    ) {
      throw new ExecApprovalConfigurationError(
        `allowlistSyncInterval must be an integer between 0 and ${MAX_SYNC_INTERVAL}, got ${config.allowlistSyncInterval}`,
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
    ...(config.nexusClient ? { nexusClient: config.nexusClient } : {}),
    approvalMode: config.approvalMode ?? "sync",
    policyTimeout: config.policyTimeout ?? DEFAULT_POLICY_TIMEOUT,
    allowlistSyncInterval: config.allowlistSyncInterval ?? DEFAULT_SYNC_INTERVAL,
    sessionId: config.sessionId ?? crypto.randomUUID(),
    additionalNeverAllow: [],
  };
}
