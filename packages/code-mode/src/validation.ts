/**
 * Code-mode validation utilities
 *
 * Config validation and post-execution output parsing.
 */

import type { CodeModeConfig } from "./types.js";

/**
 * Validate code-mode configuration.
 * Returns an array of validation error messages (empty if valid).
 */
export function validateCodeModeConfig(config: CodeModeConfig): readonly string[] {
  const validProfiles = ["strict", "standard", "permissive"] as const;

  return [
    typeof config.enabled !== "boolean" ? "enabled must be a boolean" : null,
    !validProfiles.includes(config.resourceProfile)
      ? `resourceProfile must be one of: ${validProfiles.join(", ")}; got "${config.resourceProfile}"`
      : null,
    typeof config.maxCodeLength !== "number" || config.maxCodeLength <= 0
      ? "maxCodeLength must be a positive number"
      : null,
    config.maxCodeLength > 100_000 ? "maxCodeLength must not exceed 100,000" : null,
    !Array.isArray(config.hostFunctions)
      ? "hostFunctions must be an array"
      : config.hostFunctions.some((fn) => typeof fn !== "string" || fn.length === 0)
        ? "hostFunctions entries must be non-empty strings"
        : null,
  ].filter((err): err is string => err !== null);
}

/** Result of parsing code execution output */
export interface CodeOutputResult {
  readonly success: boolean;
  readonly data: unknown;
  readonly rawStdout: string;
  readonly stderr: string;
}

/**
 * Parse and validate the output from code execution.
 *
 * Expects JSON in stdout. Returns parsed data on success,
 * or the raw stdout if JSON parsing fails.
 */
export function validateCodeOutput(stdout: string, stderr: string): CodeOutputResult {
  const trimmed = stdout.trim();

  if (trimmed.length === 0) {
    return {
      success: false,
      data: null,
      rawStdout: stdout,
      stderr,
    };
  }

  try {
    const data: unknown = JSON.parse(trimmed);
    return {
      success: true,
      data,
      rawStdout: stdout,
      stderr,
    };
  } catch {
    return {
      success: false,
      data: trimmed,
      rawStdout: stdout,
      stderr,
    };
  }
}

/** Code block regex: matches ```python-code-mode ... ``` */
const CODE_BLOCK_REGEX = /```python-code-mode\n([\s\S]*?)```/;

/**
 * Extract Python code from an LLM response content string.
 * Returns the code if a code-mode block is found, null otherwise.
 */
export function extractCodeBlock(content: string): string | null {
  const match = CODE_BLOCK_REGEX.exec(content);
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim();
}
