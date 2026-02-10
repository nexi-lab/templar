import type { SessionContext, TurnContext } from "@templar/core";
import { AuditConfigurationError } from "@templar/errors";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusAuditMiddleware, validateAuditConfig } from "../middleware.js";
import { ALL_EVENT_TYPES, COMPLIANCE_PRESETS, type NexusAuditConfig } from "../types.js";

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    userId: "test-user",
    ...overrides,
  };
}

function createTurnContext(turnNumber: number, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    sessionId: "test-session-1",
    turnNumber,
    ...overrides,
  };
}

function createConfig(overrides: Partial<NexusAuditConfig> = {}): NexusAuditConfig {
  return {
    complianceLevel: "soc2",
    ...overrides,
  };
}

function mockWriteSuccess() {
  return {
    event_id: "evt-1",
    path: "/events/audit/test-session-1",
    timestamp: "2026-02-10T12:00:00Z",
  };
}

function mockBatchWriteSuccess(count = 1) {
  return {
    written: count,
    failed: 0,
    event_ids: Array.from({ length: count }, (_, i) => `evt-${i + 1}`),
  };
}

describe("Compliance Presets", () => {
  describe("basic preset", () => {
    it("should enable only 3 event types", () => {
      const preset = COMPLIANCE_PRESETS.basic;
      expect(preset.enabledEventTypes.size).toBe(3);
      expect(preset.enabledEventTypes.has("error")).toBe(true);
      expect(preset.enabledEventTypes.has("session_start")).toBe(true);
      expect(preset.enabledEventTypes.has("session_end")).toBe(true);
    });

    it("should disable PII detection", () => {
      expect(COMPLIANCE_PRESETS.basic.detectPII).toBe(false);
    });

    it("should disable tool input logging", () => {
      expect(COMPLIANCE_PRESETS.basic.logToolInputs).toBe(false);
    });

    it("should enable secret redaction", () => {
      expect(COMPLIANCE_PRESETS.basic.redactSecrets).toBe(true);
    });
  });

  describe("soc2 preset", () => {
    it("should enable all 10 event types", () => {
      const preset = COMPLIANCE_PRESETS.soc2;
      expect(preset.enabledEventTypes.size).toBe(10);
      for (const eventType of ALL_EVENT_TYPES) {
        expect(preset.enabledEventTypes.has(eventType)).toBe(true);
      }
    });

    it("should enable tool input logging", () => {
      expect(COMPLIANCE_PRESETS.soc2.logToolInputs).toBe(true);
    });

    it("should disable PII detection", () => {
      expect(COMPLIANCE_PRESETS.soc2.detectPII).toBe(false);
    });

    it("should disable tool output logging", () => {
      expect(COMPLIANCE_PRESETS.soc2.logToolOutputs).toBe(false);
    });
  });

  describe("hipaa preset", () => {
    it("should enable all 10 event types", () => {
      const preset = COMPLIANCE_PRESETS.hipaa;
      expect(preset.enabledEventTypes.size).toBe(10);
      for (const eventType of ALL_EVENT_TYPES) {
        expect(preset.enabledEventTypes.has(eventType)).toBe(true);
      }
    });

    it("should enable PII detection", () => {
      expect(COMPLIANCE_PRESETS.hipaa.detectPII).toBe(true);
    });

    it("should enable tool input logging", () => {
      expect(COMPLIANCE_PRESETS.hipaa.logToolInputs).toBe(true);
    });

    it("should enable secret redaction", () => {
      expect(COMPLIANCE_PRESETS.hipaa.redactSecrets).toBe(true);
    });
  });
});

describe("Config Validation", () => {
  it("should accept valid basic config", () => {
    expect(() => validateAuditConfig({ complianceLevel: "basic" })).not.toThrow();
  });

  it("should accept valid soc2 config", () => {
    expect(() => validateAuditConfig({ complianceLevel: "soc2" })).not.toThrow();
  });

  it("should accept valid hipaa config", () => {
    expect(() => validateAuditConfig({ complianceLevel: "hipaa" })).not.toThrow();
  });

  it("should reject invalid compliance level", () => {
    expect(() => validateAuditConfig({ complianceLevel: "pci" as "soc2" })).toThrow(
      AuditConfigurationError,
    );
  });

  it("should reject maxBufferSize less than 1", () => {
    expect(() => validateAuditConfig(createConfig({ maxBufferSize: 0 }))).toThrow(
      AuditConfigurationError,
    );
    expect(() => validateAuditConfig(createConfig({ maxBufferSize: 0 }))).toThrow(
      /maxBufferSize must be >= 1/,
    );
  });

  it("should reject negative maxBufferSize", () => {
    expect(() => validateAuditConfig(createConfig({ maxBufferSize: -5 }))).toThrow(
      AuditConfigurationError,
    );
  });

  it("should reject maxPayloadSize less than 1", () => {
    expect(() => validateAuditConfig(createConfig({ maxPayloadSize: 0 }))).toThrow(
      AuditConfigurationError,
    );
    expect(() => validateAuditConfig(createConfig({ maxPayloadSize: 0 }))).toThrow(
      /maxPayloadSize must be >= 1/,
    );
  });

  it("should reject flushIntervalTurns less than 1", () => {
    expect(() => validateAuditConfig(createConfig({ flushIntervalTurns: 0 }))).toThrow(
      AuditConfigurationError,
    );
  });

  it("should reject negative syncWriteTimeoutMs", () => {
    expect(() => validateAuditConfig(createConfig({ syncWriteTimeoutMs: -1 }))).toThrow(
      AuditConfigurationError,
    );
    expect(() => validateAuditConfig(createConfig({ syncWriteTimeoutMs: -1 }))).toThrow(
      /syncWriteTimeoutMs must be >= 0/,
    );
  });

  it("should reject negative batchWriteTimeoutMs", () => {
    expect(() => validateAuditConfig(createConfig({ batchWriteTimeoutMs: -100 }))).toThrow(
      AuditConfigurationError,
    );
  });

  it("should warn when hipaa with redactSecrets=false", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateAuditConfig({ complianceLevel: "hipaa", redactSecrets: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("HIPAA compliance level with redactSecrets=false"),
    );
    consoleSpy.mockRestore();
  });

  it("should accept maxBufferSize of 1", () => {
    expect(() => validateAuditConfig(createConfig({ maxBufferSize: 1 }))).not.toThrow();
  });

  it("should accept syncWriteTimeoutMs of 0", () => {
    expect(() => validateAuditConfig(createConfig({ syncWriteTimeoutMs: 0 }))).not.toThrow();
  });
});

describe("Event Filtering", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    mockClient.mockEventLog.write.mockResolvedValue(mockWriteSuccess());
    mockClient.mockEventLog.batchWrite.mockResolvedValue(mockBatchWriteSuccess());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("should not emit disabled events at basic level", async () => {
    const middleware = new NexusAuditMiddleware(
      mockClient.client,
      createConfig({ complianceLevel: "basic", flushIntervalTurns: 1 }),
    );
    await middleware.onSessionStart(createSessionContext());

    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        input: "hello",
        output: "world",
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
          toolCalls: [{ name: "readFile", input: {} }],
        },
      }),
    );

    // basic level: llm_call, tool_call, message_sent, message_received are disabled
    // Only session_start was emitted (via write), no batch events expected
    if (mockClient.mockEventLog.batchWrite.mock.calls.length > 0) {
      const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
      const types = entries.map((e: { data: string }) => JSON.parse(e.data).type);
      expect(types).not.toContain("llm_call");
      expect(types).not.toContain("tool_call");
      expect(types).not.toContain("message_sent");
      expect(types).not.toContain("message_received");
    }
  });

  it("should emit all events at soc2 level", async () => {
    const middleware = new NexusAuditMiddleware(
      mockClient.client,
      createConfig({ complianceLevel: "soc2", flushIntervalTurns: 1 }),
    );
    await middleware.onSessionStart(createSessionContext());

    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        input: "hello",
        output: "world",
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
          toolCalls: [{ name: "readFile", input: {} }],
        },
      }),
    );

    expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalled();
    const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
    const types = entries.map((e: { data: string }) => JSON.parse(e.data).type);
    expect(types).toContain("llm_call");
    expect(types).toContain("tool_call");
    expect(types).toContain("message_received");
    expect(types).toContain("message_sent");
  });

  it("should allow custom eventTypes to override preset", async () => {
    const middleware = new NexusAuditMiddleware(
      mockClient.client,
      createConfig({
        complianceLevel: "soc2",
        eventTypes: ["llm_call", "error"],
        flushIntervalTurns: 1,
      }),
    );
    await middleware.onSessionStart(createSessionContext());

    // session_start is not in custom eventTypes, so no sync write
    expect(mockClient.mockEventLog.write).not.toHaveBeenCalled();

    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        input: "hello",
        output: "world",
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      }),
    );

    const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
    const types = entries.map((e: { data: string }) => JSON.parse(e.data).type);
    expect(types).toContain("llm_call");
    expect(types).not.toContain("message_received");
    expect(types).not.toContain("message_sent");
  });

  it("should emit no events when eventTypes is empty", async () => {
    const middleware = new NexusAuditMiddleware(
      mockClient.client,
      createConfig({
        complianceLevel: "soc2",
        eventTypes: [],
        flushIntervalTurns: 1,
      }),
    );
    await middleware.onSessionStart(createSessionContext());
    expect(mockClient.mockEventLog.write).not.toHaveBeenCalled();

    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        input: "hello",
        output: "world",
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      }),
    );

    expect(mockClient.mockEventLog.batchWrite).not.toHaveBeenCalled();

    await middleware.onSessionEnd(createSessionContext());
    // session_end also disabled
    expect(mockClient.mockEventLog.write).not.toHaveBeenCalled();
  });

  it("should apply partial override correctly", async () => {
    const middleware = new NexusAuditMiddleware(
      mockClient.client,
      createConfig({
        complianceLevel: "basic",
        eventTypes: ["session_start", "session_end", "llm_call"],
        flushIntervalTurns: 1,
      }),
    );
    await middleware.onSessionStart(createSessionContext());
    expect(mockClient.mockEventLog.write).toHaveBeenCalledOnce(); // session_start

    await middleware.onBeforeTurn(createTurnContext(1));
    await middleware.onAfterTurn(
      createTurnContext(1, {
        metadata: {
          usage: {
            model: "claude-opus-4",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      }),
    );

    expect(mockClient.mockEventLog.batchWrite).toHaveBeenCalled();
    const entries = mockClient.mockEventLog.batchWrite.mock.calls[0]?.[0].entries;
    const types = entries.map((e: { data: string }) => JSON.parse(e.data).type);
    expect(types).toContain("llm_call");
  });
});
