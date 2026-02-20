import type { ExecutionStrategy, OnFailureMode } from "./types.js";

export const PACKAGE_NAME = "@templar/guardrails" as const;

export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_VALIDATION_TIMEOUT_MS = 5_000;
export const DEFAULT_ON_FAILURE: OnFailureMode = "retry";
export const DEFAULT_EXECUTION_STRATEGY: ExecutionStrategy = "sequential";
