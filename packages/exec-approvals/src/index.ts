/**
 * @templar/exec-approvals
 *
 * Progressive command allowlisting middleware for Templar agent execution.
 *
 * Provides:
 * - Shell command parsing and risk classification
 * - NEVER_ALLOW hard block list for categorically destructive commands
 * - Safe binary registry for known-safe commands
 * - Per-agent allowlist with auto-promotion after N human approvals
 * - Templar middleware integration via createExecApprovalsMiddleware()
 * - Environment variable sanitization
 */

// Allowlist
export { AllowlistStore } from "./allowlist.js";
// Analyzer
export { ExecApprovals, extractPattern } from "./analyzer.js";
// Config
export { resolveExecApprovalsConfig } from "./config.js";
// Constants
export {
  DANGEROUS_FLAG_PATTERNS,
  DEFAULT_AUTO_PROMOTE_THRESHOLD,
  DEFAULT_MAX_PATTERNS,
  DEFAULT_SAFE_BINARIES,
  DEFAULT_SENSITIVE_ENV_PATTERNS,
  DEFAULT_TOOL_NAMES,
  NEVER_ALLOW_PATTERNS,
  PACKAGE_NAME,
} from "./constants.js";
// Middleware
export { createExecApprovalsMiddleware } from "./middleware.js";
// Parser
export { parseCommand } from "./parser.js";
// Registry
export { createRegistry, isSafeBinary } from "./registry.js";
// Sanitizer
export { sanitizeEnv } from "./sanitizer.js";
// Core types
export type {
  AllowlistEntry,
  AnalysisAction,
  AnalysisResult,
  CommandPattern,
  DangerousFlagPattern,
  ExecApprovalsConfig,
  MatchedRule,
  ParsedCommand,
  ResolvedExecApprovalsConfig,
  RiskLevel,
  SanitizedEnv,
} from "./types.js";
