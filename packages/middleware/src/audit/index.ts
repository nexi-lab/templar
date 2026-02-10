import type { NexusClient } from "@nexus/sdk";
import { NexusAuditMiddleware, validateAuditConfig } from "./middleware.js";
import type { NexusAuditConfig } from "./types.js";

/**
 * Create a NexusAuditMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - Audit middleware configuration
 * @returns A configured NexusAuditMiddleware instance
 * @throws {AuditConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createNexusAuditMiddleware } from '@templar/middleware/audit';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const auditMiddleware = createNexusAuditMiddleware(client, {
 *   complianceLevel: 'soc2',
 *   redactSecrets: true,
 *   customRedactionPatterns: [
 *     { name: 'internal_token', pattern: /tok_[a-zA-Z0-9]{32}/gi },
 *   ],
 * });
 * ```
 */
export function createNexusAuditMiddleware(
  client: NexusClient,
  config: NexusAuditConfig,
): NexusAuditMiddleware {
  validateAuditConfig(config);
  return new NexusAuditMiddleware(client, config);
}

// Re-export class and validation
export { NexusAuditMiddleware, validateAuditConfig } from "./middleware.js";

// Re-export redaction utilities
export {
  BUILT_IN_SECRET_PATTERNS,
  buildRedactionPatterns,
  PII_PATTERNS,
  redactSecrets,
  serializeAndRedact,
  truncatePayload,
} from "./redaction.js";

// Re-export types and constants
export type {
  AuditEvent,
  AuditEventType,
  BudgetWarningEvent,
  ComplianceLevel,
  CompliancePreset,
  ErrorEvent,
  LlmCallEvent,
  MessageReceivedEvent,
  MessageSentEvent,
  NexusAuditConfig,
  PermissionCheckEvent,
  RedactionPattern,
  SessionEndEvent,
  SessionStartEvent,
  StateChangeEvent,
  ToolCallEvent,
} from "./types.js";
export {
  ALL_EVENT_TYPES,
  COMPLIANCE_PRESETS,
  CRITICAL_EVENT_TYPES,
  DEFAULT_AUDIT_CONFIG,
} from "./types.js";
