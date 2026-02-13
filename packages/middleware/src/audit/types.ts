/**
 * Audit middleware types — compliance logging via Nexus Event Log
 *
 * Supports three compliance levels: basic, soc2, hipaa.
 * Uses a discriminated union for type-safe audit events.
 */

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

/**
 * Compliance level controlling which events are logged and how.
 *
 * - "basic": Errors and session boundaries only
 * - "soc2": All actions with cost attribution
 * - "hipaa": All actions with PII detection
 */
export type ComplianceLevel = "basic" | "soc2" | "hipaa";

/**
 * All audit event types emitted by the middleware.
 */
export type AuditEventType =
  | "llm_call"
  | "tool_call"
  | "message_sent"
  | "message_received"
  | "session_start"
  | "session_end"
  | "budget_warning"
  | "error"
  | "permission_check"
  | "state_change";

/**
 * Critical events that are always flushed synchronously.
 */
export const CRITICAL_EVENT_TYPES: ReadonlySet<AuditEventType> = new Set([
  "error",
  "budget_warning",
  "session_start",
  "session_end",
]);

/** All 10 audit event types as an array (for preset construction). */
export const ALL_EVENT_TYPES: readonly AuditEventType[] = [
  "llm_call",
  "tool_call",
  "message_sent",
  "message_received",
  "session_start",
  "session_end",
  "budget_warning",
  "error",
  "permission_check",
  "state_change",
] as const;

// ============================================================================
// REDACTION
// ============================================================================

/**
 * A named regex pattern for secret/PII redaction.
 */
export interface RedactionPattern {
  /** Human-readable name for the pattern */
  readonly name: string;
  /** Regex to match sensitive data */
  readonly pattern: RegExp;
  /** Replacement text (default: "[REDACTED]") */
  readonly replacement?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for NexusAuditMiddleware
 */
export interface NexusAuditConfig {
  /** Compliance level — determines event presets (required) */
  complianceLevel: ComplianceLevel;

  /** Auto-redact API keys, Bearer tokens, connection strings (default: true) */
  redactSecrets?: boolean;

  /** Log tool call inputs (default: true for soc2+, false for basic) */
  logToolInputs?: boolean;

  /** Log tool call outputs (default: false — can be large) */
  logToolOutputs?: boolean;

  /** Override which event types to log (default: determined by compliance level) */
  eventTypes?: readonly AuditEventType[];

  /** Additional user-defined redaction patterns */
  customRedactionPatterns?: readonly RedactionPattern[];

  /** Max events in the buffer before forced flush (default: 500) */
  maxBufferSize?: number;

  /** Max payload size in bytes before truncation (default: 32768 = 32KB) */
  maxPayloadSize?: number;

  /** Flush buffered routine events every N turns (default: 5) */
  flushIntervalTurns?: number;

  /** Timeout for sync (critical) event writes in ms (default: 2000) */
  syncWriteTimeoutMs?: number;

  /** Timeout for batch (routine) event writes in ms (default: 5000) */
  batchWriteTimeoutMs?: number;

  /** Called when buffer overflow drops events */
  onBufferOverflow?: (droppedCount: number) => void;
}

// ============================================================================
// COMPLIANCE PRESETS
// ============================================================================

/**
 * Resolved compliance preset derived from a ComplianceLevel.
 */
export interface CompliancePreset {
  /** Which event types to log */
  readonly enabledEventTypes: ReadonlySet<AuditEventType>;
  /** Whether to redact secrets */
  readonly redactSecrets: boolean;
  /** Whether to log tool call inputs */
  readonly logToolInputs: boolean;
  /** Whether to log tool call outputs */
  readonly logToolOutputs: boolean;
  /** Whether to enable PII detection patterns (HIPAA) */
  readonly detectPII: boolean;
}

/**
 * Built-in compliance presets.
 */
export const COMPLIANCE_PRESETS: Readonly<Record<ComplianceLevel, CompliancePreset>> = {
  basic: {
    enabledEventTypes: new Set<AuditEventType>(["error", "session_start", "session_end"]),
    redactSecrets: true,
    logToolInputs: false,
    logToolOutputs: false,
    detectPII: false,
  },
  soc2: {
    enabledEventTypes: new Set<AuditEventType>(ALL_EVENT_TYPES),
    redactSecrets: true,
    logToolInputs: true,
    logToolOutputs: false,
    detectPII: false,
  },
  hipaa: {
    enabledEventTypes: new Set<AuditEventType>(ALL_EVENT_TYPES),
    redactSecrets: true,
    logToolInputs: true,
    logToolOutputs: false,
    detectPII: true,
  },
};

/**
 * Default configuration values.
 */
export const DEFAULT_AUDIT_CONFIG = {
  redactSecrets: true,
  logToolOutputs: false,
  maxBufferSize: 500,
  maxPayloadSize: 32768,
  flushIntervalTurns: 5,
  syncWriteTimeoutMs: 2000,
  batchWriteTimeoutMs: 5000,
} as const;

// ============================================================================
// AUDIT EVENT TYPES (Discriminated Union)
// ============================================================================

/**
 * Common fields shared by all audit events.
 */
interface BaseAuditEvent {
  /** Unique event identifier (UUID) */
  readonly eventId: string;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Session this event belongs to */
  readonly sessionId: string;
  /** Boundary tracing span ID (correlates before/after turn, or OTel spanId when available) */
  readonly spanId: string;
  /** OTel trace ID for distributed tracing (present when OTel is active) */
  readonly traceId?: string;
  /** Agent that generated the event */
  readonly agentId?: string;
}

export interface SessionStartEvent extends BaseAuditEvent {
  readonly type: "session_start";
  readonly userId?: string;
  readonly complianceLevel: ComplianceLevel;
}

export interface SessionEndEvent extends BaseAuditEvent {
  readonly type: "session_end";
  readonly turnCount: number;
  readonly totalEvents: number;
}

export interface LlmCallEvent extends BaseAuditEvent {
  readonly type: "llm_call";
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cost?: number;
}

export interface ToolCallEvent extends BaseAuditEvent {
  readonly type: "tool_call";
  readonly toolName: string;
  readonly input?: string;
  readonly output?: string;
  readonly durationMs?: number;
}

export interface MessageSentEvent extends BaseAuditEvent {
  readonly type: "message_sent";
  readonly channelId?: string;
  readonly contentPreview?: string;
}

export interface MessageReceivedEvent extends BaseAuditEvent {
  readonly type: "message_received";
  readonly channelId?: string;
  readonly contentPreview?: string;
}

export interface BudgetWarningEvent extends BaseAuditEvent {
  readonly type: "budget_warning";
  readonly budget: number;
  readonly spent: number;
  readonly remaining: number;
  readonly pressure: number;
}

export interface ErrorEvent extends BaseAuditEvent {
  readonly type: "error";
  readonly errorCode?: string;
  readonly errorMessage: string;
}

export interface PermissionCheckEvent extends BaseAuditEvent {
  readonly type: "permission_check";
  readonly resource: string;
  readonly action: string;
  readonly granted: boolean;
}

export interface StateChangeEvent extends BaseAuditEvent {
  readonly type: "state_change";
  readonly key: string;
  readonly previousValue?: string;
  readonly newValue?: string;
}

/**
 * Union of all audit event types (discriminated on `type`).
 */
export type AuditEvent =
  | SessionStartEvent
  | SessionEndEvent
  | LlmCallEvent
  | ToolCallEvent
  | MessageSentEvent
  | MessageReceivedEvent
  | BudgetWarningEvent
  | ErrorEvent
  | PermissionCheckEvent
  | StateChangeEvent;
