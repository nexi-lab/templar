import { randomUUID } from "node:crypto";
import type { NexusClient } from "@nexus/sdk";
import { trace } from "@opentelemetry/api";
import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { AuditConfigurationError } from "@templar/errors";
import { safeCall } from "../utils.js";
import { buildRedactionPatterns, serializeAndRedact } from "./redaction.js";
import {
  type AuditEvent,
  type AuditEventType,
  type BudgetWarningEvent,
  COMPLIANCE_PRESETS,
  type ComplianceLevel,
  type CompliancePreset,
  CRITICAL_EVENT_TYPES,
  DEFAULT_AUDIT_CONFIG,
  type ErrorEvent,
  type LlmCallEvent,
  type MessageReceivedEvent,
  type MessageSentEvent,
  type NexusAuditConfig,
  type PermissionCheckEvent,
  type RedactionPattern,
  type SessionEndEvent,
  type SessionStartEvent,
  type StateChangeEvent,
  type ToolCallEvent,
} from "./types.js";

/**
 * NexusAuditMiddleware — compliance logging via Nexus Event Log.
 *
 * Records agent actions as immutable events in the Nexus Event Log
 * for compliance (SOC2, HIPAA), debugging, and cost attribution.
 *
 * Features:
 * - Dual-mode flush: sync for critical events, buffered batch for routine
 * - Secret redaction (Bearer tokens, API keys, connection strings)
 * - PII detection (email, phone, SSN) at HIPAA level
 * - AgentSight boundary tracing (spanId per turn)
 * - Cost attribution via PayMiddleware metadata
 * - Bounded buffer with backpressure (default: 500 events)
 *
 * Lifecycle:
 * 1. Session start → emit session_start (sync), initialize state
 * 2. Before turn → generate spanId for boundary tracing
 * 3. After turn → extract and buffer events, periodic flush
 * 4. Session end → flush buffer, emit session_end (sync)
 */
export class NexusAuditMiddleware implements TemplarMiddleware {
  readonly name = "nexus-audit";

  private readonly client: NexusClient;
  private readonly complianceLevel: ComplianceLevel;
  private readonly preset: CompliancePreset;
  private readonly enabledEventTypes: ReadonlySet<AuditEventType>;
  private readonly redactionPatterns: readonly RedactionPattern[];
  private readonly logToolInputs: boolean;
  private readonly logToolOutputs: boolean;
  private readonly maxBufferSize: number;
  private readonly maxPayloadSize: number;
  private readonly flushIntervalTurns: number;
  private readonly syncWriteTimeoutMs: number;
  private readonly batchWriteTimeoutMs: number;
  private readonly onBufferOverflow: ((droppedCount: number) => void) | undefined;

  // State — reassigned, not mutated
  private turnCount = 0;
  private totalEvents = 0;
  private buffer: readonly AuditEvent[] = [];
  private activeSpanId: string | undefined = undefined;
  private activeTraceId: string | undefined = undefined;

  constructor(client: NexusClient, config: NexusAuditConfig) {
    this.client = client;
    this.complianceLevel = config.complianceLevel;
    this.preset = COMPLIANCE_PRESETS[config.complianceLevel];

    // Resolve enabled event types: user override or preset
    this.enabledEventTypes =
      config.eventTypes !== undefined ? new Set(config.eventTypes) : this.preset.enabledEventTypes;

    // Resolve config with defaults
    const redactSecrets = config.redactSecrets ?? DEFAULT_AUDIT_CONFIG.redactSecrets;
    this.logToolInputs = config.logToolInputs ?? this.preset.logToolInputs;
    this.logToolOutputs = config.logToolOutputs ?? DEFAULT_AUDIT_CONFIG.logToolOutputs;
    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_AUDIT_CONFIG.maxBufferSize;
    this.maxPayloadSize = config.maxPayloadSize ?? DEFAULT_AUDIT_CONFIG.maxPayloadSize;
    this.flushIntervalTurns = config.flushIntervalTurns ?? DEFAULT_AUDIT_CONFIG.flushIntervalTurns;
    this.syncWriteTimeoutMs = config.syncWriteTimeoutMs ?? DEFAULT_AUDIT_CONFIG.syncWriteTimeoutMs;
    this.batchWriteTimeoutMs =
      config.batchWriteTimeoutMs ?? DEFAULT_AUDIT_CONFIG.batchWriteTimeoutMs;
    this.onBufferOverflow = config.onBufferOverflow;

    // Build combined redaction patterns
    this.redactionPatterns = buildRedactionPatterns(
      redactSecrets,
      this.preset.detectPII,
      config.customRedactionPatterns ?? [],
    );
  }

  // ===========================================================================
  // LIFECYCLE HOOKS
  // ===========================================================================

  /**
   * Reset state and emit session_start event (sync flush).
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    this.resetState();

    if (!this.isEventEnabled("session_start")) {
      return;
    }

    const event: SessionStartEvent = {
      ...this.createBaseFields(context.sessionId),
      type: "session_start",
      ...(context.userId !== undefined ? { userId: context.userId } : {}),
      complianceLevel: this.complianceLevel,
    };

    await this.flushSync(event, context.sessionId);
  }

  /**
   * Generate spanId for boundary tracing. Inject into metadata.
   * Uses OTel span context when available, falls back to UUID.
   */
  async onBeforeTurn(context: TurnContext): Promise<void> {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      this.activeSpanId = spanContext.spanId;
      this.activeTraceId = spanContext.traceId;
    } else {
      this.activeSpanId = randomUUID();
      this.activeTraceId = undefined;
    }

    // Inject audit context into metadata for downstream consumers
    const metadata = context.metadata ?? {};
    context.metadata = {
      ...metadata,
      audit: {
        spanId: this.activeSpanId,
        ...(this.activeTraceId !== undefined ? { traceId: this.activeTraceId } : {}),
      },
    };
  }

  /**
   * Extract events from turn context and buffer/flush them.
   */
  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    const sessionId = context.sessionId;
    const spanId = this.activeSpanId ?? "";

    // Extract LLM call event
    this.emitLlmCallEvent(context, sessionId, spanId);

    // Extract tool call events
    this.emitToolCallEvents(context, sessionId, spanId);

    // Extract message events
    this.emitMessageEvents(context, sessionId, spanId);

    // Extract budget warning event
    this.emitBudgetWarningEvent(context, sessionId, spanId);

    // Extract error event
    this.emitErrorEvent(context, sessionId, spanId);

    // Extract permission check event
    this.emitPermissionCheckEvent(context, sessionId, spanId);

    // Extract state change event
    this.emitStateChangeEvent(context, sessionId, spanId);

    // Periodic buffer flush
    if (this.turnCount % this.flushIntervalTurns === 0 && this.buffer.length > 0) {
      await this.flushBuffer(sessionId);
    }

    // Clear span
    this.activeSpanId = undefined;
    this.activeTraceId = undefined;
  }

  /**
   * Flush remaining buffer and emit session_end event (sync flush).
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    // Flush any remaining buffered events
    if (this.buffer.length > 0) {
      await this.flushBuffer(context.sessionId);
    }

    if (this.isEventEnabled("session_end")) {
      const event: SessionEndEvent = {
        ...this.createBaseFields(context.sessionId),
        type: "session_end",
        turnCount: this.turnCount,
        totalEvents: this.totalEvents,
      };

      await this.flushSync(event, context.sessionId);
    }

    this.resetState();
  }

  // ===========================================================================
  // EVENT EXTRACTION
  // ===========================================================================

  private emitLlmCallEvent(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("llm_call")) {
      return;
    }

    const usage = this.extractUsage(context);
    if (usage === undefined) {
      return;
    }

    const budget = this.extractBudget(context);

    const event: LlmCallEvent = {
      ...this.createBaseFieldsWithSpan(sessionId, spanId),
      type: "llm_call",
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      ...(budget?.sessionCost !== undefined ? { cost: budget.sessionCost } : {}),
    };

    this.addToBuffer(event, sessionId);
  }

  private emitToolCallEvents(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("tool_call")) {
      return;
    }

    const metadata = context.metadata;
    if (metadata === undefined) {
      return;
    }

    const toolCalls = metadata.toolCalls;
    if (!Array.isArray(toolCalls)) {
      return;
    }

    for (const call of toolCalls) {
      if (typeof call !== "object" || call === null) {
        continue;
      }

      const record = call as Record<string, unknown>;
      const event: ToolCallEvent = {
        ...this.createBaseFieldsWithSpan(sessionId, spanId),
        type: "tool_call",
        toolName: typeof record.name === "string" ? record.name : "unknown",
        ...(this.logToolInputs && record.input !== undefined
          ? { input: this.redact(record.input) }
          : {}),
        ...(this.logToolOutputs && record.output !== undefined
          ? { output: this.redact(record.output) }
          : {}),
        ...(typeof record.durationMs === "number" ? { durationMs: record.durationMs } : {}),
      };

      this.addToBuffer(event, sessionId);
    }
  }

  private emitMessageEvents(context: TurnContext, sessionId: string, spanId: string): void {
    // message_received from input
    if (this.isEventEnabled("message_received") && context.input !== undefined) {
      const preview = this.redact(context.input);
      const event: MessageReceivedEvent = {
        ...this.createBaseFieldsWithSpan(sessionId, spanId),
        type: "message_received",
        ...(preview !== "" ? { contentPreview: preview } : {}),
      };
      this.addToBuffer(event, sessionId);
    }

    // message_sent from output
    if (this.isEventEnabled("message_sent") && context.output !== undefined) {
      const preview = this.redact(context.output);
      const event: MessageSentEvent = {
        ...this.createBaseFieldsWithSpan(sessionId, spanId),
        type: "message_sent",
        ...(preview !== "" ? { contentPreview: preview } : {}),
      };
      this.addToBuffer(event, sessionId);
    }
  }

  private emitBudgetWarningEvent(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("budget_warning")) {
      return;
    }

    const budget = this.extractBudget(context);
    if (budget === undefined || budget.pressure < 0.8) {
      return;
    }

    const event: BudgetWarningEvent = {
      ...this.createBaseFieldsWithSpan(sessionId, spanId),
      type: "budget_warning",
      budget: budget.dailyBudget,
      spent: budget.sessionCost,
      remaining: budget.remaining,
      pressure: budget.pressure,
    };

    // Budget warning is critical — sync flush
    void this.flushSync(event, sessionId);
  }

  private emitErrorEvent(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("error")) {
      return;
    }

    const metadata = context.metadata;
    if (metadata === undefined) {
      return;
    }

    const err = metadata.error;
    if (err === undefined || typeof err !== "object" || err === null) {
      return;
    }

    const record = err as Record<string, unknown>;
    const event: ErrorEvent = {
      ...this.createBaseFieldsWithSpan(sessionId, spanId),
      type: "error",
      ...(typeof record.code === "string" ? { errorCode: record.code } : {}),
      errorMessage: typeof record.message === "string" ? record.message : String(err),
    };

    // Error is critical — sync flush
    void this.flushSync(event, sessionId);
  }

  private emitPermissionCheckEvent(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("permission_check")) {
      return;
    }

    const metadata = context.metadata;
    if (metadata === undefined) {
      return;
    }

    const perm = metadata.permissionCheck;
    if (perm === undefined || typeof perm !== "object" || perm === null) {
      return;
    }

    const record = perm as Record<string, unknown>;
    if (typeof record.resource !== "string" || typeof record.action !== "string") {
      return;
    }

    const event: PermissionCheckEvent = {
      ...this.createBaseFieldsWithSpan(sessionId, spanId),
      type: "permission_check",
      resource: record.resource,
      action: record.action,
      granted: record.granted === true,
    };

    this.addToBuffer(event, sessionId);
  }

  private emitStateChangeEvent(context: TurnContext, sessionId: string, spanId: string): void {
    if (!this.isEventEnabled("state_change")) {
      return;
    }

    const metadata = context.metadata;
    if (metadata === undefined) {
      return;
    }

    const change = metadata.stateChange;
    if (change === undefined || typeof change !== "object" || change === null) {
      return;
    }

    const record = change as Record<string, unknown>;
    if (typeof record.key !== "string") {
      return;
    }

    const event: StateChangeEvent = {
      ...this.createBaseFieldsWithSpan(sessionId, spanId),
      type: "state_change",
      key: record.key,
      ...(typeof record.previousValue === "string" ? { previousValue: record.previousValue } : {}),
      ...(typeof record.newValue === "string" ? { newValue: record.newValue } : {}),
    };

    this.addToBuffer(event, sessionId);
  }

  // ===========================================================================
  // FLUSH HELPERS
  // ===========================================================================

  /**
   * Write a single event synchronously (with timeout).
   * Falls back to buffering on timeout/error.
   */
  private async flushSync(event: AuditEvent, sessionId: string): Promise<void> {
    this.totalEvents += 1;
    const serialized = this.redact(event);

    const result = await safeCall(
      () =>
        this.client.eventLog.write({
          path: `/events/audit/${sessionId}`,
          data: serialized,
          timestamp: event.timestamp,
        }),
      this.syncWriteTimeoutMs,
      this.name,
      sessionId,
    );

    if (result === undefined) {
      // Sync failed — fall back to buffer
      this.buffer = [...this.buffer, event];
    }
  }

  /**
   * Batch-write all buffered events. On failure, retain for retry.
   */
  private async flushBuffer(sessionId: string): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const toFlush = this.buffer;
    const entries = toFlush.map((event) => ({
      path: `/events/audit/${sessionId}`,
      data: this.redact(event),
      timestamp: event.timestamp,
    }));

    const result = await safeCall(
      () => this.client.eventLog.batchWrite({ entries }),
      this.batchWriteTimeoutMs,
      this.name,
      sessionId,
    );

    if (result !== undefined) {
      // Success — clear buffer
      this.buffer = [];
    }
    // On failure: retain buffer for next flush (same pattern as NexusMemoryMiddleware)
  }

  // ===========================================================================
  // BUFFER MANAGEMENT
  // ===========================================================================

  /**
   * Add event to the buffer. Enforces maxBufferSize with backpressure.
   */
  private addToBuffer(event: AuditEvent, sessionId: string): void {
    this.totalEvents += 1;

    // Check if buffer is at capacity
    if (this.buffer.length >= this.maxBufferSize) {
      // Try to force flush first
      void this.flushBuffer(sessionId);

      // If still at capacity after flush attempt, drop oldest non-critical
      if (this.buffer.length >= this.maxBufferSize) {
        this.dropOldestNonCritical();
      }
    }

    this.buffer = [...this.buffer, event];
  }

  /**
   * Drop the oldest non-critical event from the buffer.
   * If all events are critical, drop the oldest anyway.
   */
  private dropOldestNonCritical(): void {
    const dropIndex = this.buffer.findIndex((e) => !CRITICAL_EVENT_TYPES.has(e.type));

    let dropped: readonly AuditEvent[];
    if (dropIndex !== -1) {
      dropped = [...this.buffer.slice(0, dropIndex), ...this.buffer.slice(dropIndex + 1)];
    } else {
      // All critical — drop oldest
      dropped = this.buffer.slice(1);
    }

    this.buffer = dropped;

    if (this.onBufferOverflow !== undefined) {
      this.onBufferOverflow(1);
    }

    console.warn(`[${this.name}] Buffer overflow: dropped 1 event (buffer at max capacity)`);
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private isEventEnabled(type: AuditEventType): boolean {
    return this.enabledEventTypes.has(type);
  }

  private createBaseFields(sessionId: string): {
    eventId: string;
    timestamp: string;
    sessionId: string;
    spanId: string;
    traceId?: string;
  } {
    return {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      spanId: this.activeSpanId ?? "",
      ...(this.activeTraceId !== undefined ? { traceId: this.activeTraceId } : {}),
    };
  }

  private createBaseFieldsWithSpan(
    sessionId: string,
    spanId: string,
  ): {
    eventId: string;
    timestamp: string;
    sessionId: string;
    spanId: string;
    traceId?: string;
  } {
    return {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      spanId,
      ...(this.activeTraceId !== undefined ? { traceId: this.activeTraceId } : {}),
    };
  }

  private redact(payload: unknown): string {
    return serializeAndRedact(payload, this.redactionPatterns, this.maxPayloadSize);
  }

  private extractUsage(
    context: TurnContext,
  ): { model: string; inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    const usage = metadata.usage;
    if (usage === undefined || typeof usage !== "object" || usage === null) {
      return undefined;
    }

    const record = usage as Record<string, unknown>;
    if (typeof record.model !== "string" || typeof record.inputTokens !== "number") {
      return undefined;
    }

    return {
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: typeof record.outputTokens === "number" ? record.outputTokens : 0,
      totalTokens: typeof record.totalTokens === "number" ? record.totalTokens : 0,
    };
  }

  private extractBudget(
    context: TurnContext,
  ): { remaining: number; dailyBudget: number; pressure: number; sessionCost: number } | undefined {
    const metadata = context.metadata;
    if (metadata === undefined) {
      return undefined;
    }

    const budget = metadata.budget;
    if (budget === undefined || typeof budget !== "object" || budget === null) {
      return undefined;
    }

    const record = budget as Record<string, unknown>;
    if (typeof record.remaining !== "number" || typeof record.pressure !== "number") {
      return undefined;
    }

    return {
      remaining: record.remaining,
      dailyBudget: typeof record.dailyBudget === "number" ? record.dailyBudget : 0,
      pressure: record.pressure,
      sessionCost: typeof record.sessionCost === "number" ? record.sessionCost : 0,
    };
  }

  private resetState(): void {
    this.turnCount = 0;
    this.totalEvents = 0;
    this.buffer = [];
    this.activeSpanId = undefined;
    this.activeTraceId = undefined;
  }
}

// ===========================================================================
// CONFIG VALIDATION
// ===========================================================================

const VALID_COMPLIANCE_LEVELS: ReadonlySet<string> = new Set(["basic", "soc2", "hipaa"]);

/**
 * Validate NexusAuditConfig.
 * @throws {AuditConfigurationError} if config is invalid
 */
export function validateAuditConfig(config: NexusAuditConfig): void {
  if (!VALID_COMPLIANCE_LEVELS.has(config.complianceLevel)) {
    throw new AuditConfigurationError(
      `Invalid complianceLevel: "${config.complianceLevel}". Must be one of: basic, soc2, hipaa`,
    );
  }

  if (config.maxBufferSize !== undefined && config.maxBufferSize < 1) {
    throw new AuditConfigurationError(`maxBufferSize must be >= 1, got ${config.maxBufferSize}`);
  }

  if (config.maxPayloadSize !== undefined && config.maxPayloadSize < 1) {
    throw new AuditConfigurationError(`maxPayloadSize must be >= 1, got ${config.maxPayloadSize}`);
  }

  if (config.flushIntervalTurns !== undefined && config.flushIntervalTurns < 1) {
    throw new AuditConfigurationError(
      `flushIntervalTurns must be >= 1, got ${config.flushIntervalTurns}`,
    );
  }

  if (config.syncWriteTimeoutMs !== undefined && config.syncWriteTimeoutMs < 0) {
    throw new AuditConfigurationError(
      `syncWriteTimeoutMs must be >= 0, got ${config.syncWriteTimeoutMs}`,
    );
  }

  if (config.batchWriteTimeoutMs !== undefined && config.batchWriteTimeoutMs < 0) {
    throw new AuditConfigurationError(
      `batchWriteTimeoutMs must be >= 0, got ${config.batchWriteTimeoutMs}`,
    );
  }

  // Warn if HIPAA level but secrets redaction disabled
  if (config.complianceLevel === "hipaa" && config.redactSecrets === false) {
    console.warn(
      "[nexus-audit] WARNING: HIPAA compliance level with redactSecrets=false " +
        "may violate compliance requirements",
    );
  }
}
