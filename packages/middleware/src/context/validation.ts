/**
 * Config validation for context hydration (#59).
 */

import type { ContextHydrationConfig } from "@templar/core";
import type { ErrorDomain, GrpcStatusCode, HttpStatusCode } from "@templar/errors";
import { ContextHydrationError, ERROR_CATALOG } from "@templar/errors";

/**
 * Concrete error for invalid config (thrown during validation only).
 */
class ContextHydrationConfigError extends ContextHydrationError {
  readonly _tag = "ContextHydrationError" as const;
  readonly code = "CONTEXT_HYDRATION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(message);
    const entry = ERROR_CATALOG.CONTEXT_HYDRATION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

/**
 * Validate a ContextHydrationConfig at runtime.
 *
 * @throws {ContextHydrationError} if config is invalid
 */
export function validateContextHydrationConfig(config: ContextHydrationConfig): void {
  if (config.maxHydrationTimeMs !== undefined && config.maxHydrationTimeMs <= 0) {
    throw new ContextHydrationConfigError(
      `maxHydrationTimeMs must be positive, got ${config.maxHydrationTimeMs}`,
    );
  }

  if (config.maxContextChars !== undefined && config.maxContextChars <= 0) {
    throw new ContextHydrationConfigError(
      `maxContextChars must be positive, got ${config.maxContextChars}`,
    );
  }

  if (
    config.failureStrategy !== undefined &&
    config.failureStrategy !== "continue" &&
    config.failureStrategy !== "abort"
  ) {
    throw new ContextHydrationConfigError(
      `failureStrategy must be "continue" or "abort", got "${config.failureStrategy}"`,
    );
  }

  const validTypes = ["mcp_tool", "workspace_snapshot", "memory_query", "linked_resource"];

  if (config.sources) {
    for (const source of config.sources) {
      if (!validTypes.includes(source.type)) {
        throw new ContextHydrationConfigError(
          `Invalid source type "${source.type}". Must be one of: ${validTypes.join(", ")}`,
        );
      }

      if (source.maxChars !== undefined && source.maxChars <= 0) {
        throw new ContextHydrationConfigError(
          `Source maxChars must be positive, got ${source.maxChars}`,
        );
      }

      if (source.timeoutMs !== undefined && source.timeoutMs <= 0) {
        throw new ContextHydrationConfigError(
          `Source timeoutMs must be positive, got ${source.timeoutMs}`,
        );
      }
    }
  }
}
