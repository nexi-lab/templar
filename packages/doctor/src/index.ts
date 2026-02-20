// ============================================================================
// @templar/doctor — Security Scanner + Multi-Tenant Audits
// ============================================================================

// Built-in checks
export {
  BudgetLeakDetectionCheck,
  ChannelSecurityCheck,
  FilesystemPermissionsCheck,
  GatewayExposureCheck,
  generateAttackSurfaceSummary,
  getBuiltinChecks,
  MultiTenantIsolationCheck,
  SecretsScanningCheck,
  SkillCodeSafetyCheck,
} from "./checks/index.js";

// Engine
export { runAudit } from "./engine.js";

// Finding factory
export {
  createCheckResult,
  createErrorResult,
  createFinding,
  createSkippedResult,
} from "./finding-factory.js";
// Middleware
export { DoctorMiddleware } from "./middleware.js";
export { JsonReporter } from "./reporters/json-reporter.js";
export { TerminalReporter } from "./reporters/terminal-reporter.js";
// Reporters
export type { DoctorReporter } from "./reporters/types.js";
// Types
export type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorConfig,
  DoctorFinding,
  DoctorReport,
  DoctorSummary,
  OwaspAgenticRef,
  Severity,
} from "./types.js";

// Package metadata
export const PACKAGE_NAME = "@templar/doctor";
export const PACKAGE_VERSION = "0.1.0";
