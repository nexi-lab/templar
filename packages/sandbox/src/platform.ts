import { ExternalError, ValidationError } from "@templar/errors";
import type { SandboxDependencyReport, SandboxPlatform } from "./types.js";

/**
 * Detect the current OS platform for sandbox support.
 * Throws SANDBOX_PLATFORM_UNSUPPORTED for unsupported platforms.
 */
export function detectPlatform(): SandboxPlatform {
  const platform = process.platform;
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";

  throw new ValidationError({
    code: "SANDBOX_PLATFORM_UNSUPPORTED",
    message: `Sandboxing is not supported on "${platform}". Supported platforms: macOS (darwin), Linux.`,
  });
}

/**
 * Check whether sandbox dependencies are available on the current platform.
 * Returns a structured report rather than throwing.
 */
export function checkPlatformDependencies(): SandboxDependencyReport {
  const platform = process.platform;

  if (platform !== "darwin" && platform !== "linux") {
    return {
      available: false,
      platform: "unsupported",
      details: `Sandboxing is not supported on "${platform}". Supported platforms: macOS (darwin), Linux.`,
    };
  }

  const detectedPlatform: SandboxPlatform = platform === "darwin" ? "macos" : "linux";

  return {
    available: true,
    platform: detectedPlatform,
    details:
      detectedPlatform === "macos"
        ? "macOS Seatbelt (sandbox-exec) is available"
        : "Linux bubblewrap sandbox is available",
  };
}

/**
 * Assert that sandbox dependencies are installed, or throw with
 * an actionable error message.
 */
export function assertDependenciesAvailable(): void {
  const report = checkPlatformDependencies();
  if (!report.available) {
    throw report.platform === "unsupported"
      ? new ValidationError({
          code: "SANDBOX_PLATFORM_UNSUPPORTED",
          message: report.details,
        })
      : new ExternalError({
          code: "SANDBOX_UNAVAILABLE",
          message: report.details,
        });
  }
}
