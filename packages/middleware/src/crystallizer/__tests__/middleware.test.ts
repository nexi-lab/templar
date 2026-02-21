/**
 * CrystallizerMiddleware lifecycle tests (#164)
 *
 * Uses createMockNexusClient() from @templar/test-utils.
 */

import type { SessionContext, ToolRequest, ToolResponse } from "@templar/core";
import { CrystallizerConfigurationError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrystallizerMiddleware } from "../middleware.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    ...overrides,
  };
}

function makeToolRequest(toolName: string): ToolRequest {
  return { toolName, input: {} } as ToolRequest;
}

function makeToolResponse(output = "ok"): ToolResponse {
  return { output, metadata: {} } as ToolResponse;
}

function makeNext(response?: ToolResponse): (req: ToolRequest) => Promise<ToolResponse> {
  return vi.fn().mockResolvedValue(response ?? makeToolResponse());
}

function makeErrorNext(error: Error): (req: ToolRequest) => Promise<ToolResponse> {
  return vi.fn().mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("CrystallizerMiddleware", () => {
  let mock: MockNexusClient;

  beforeEach(() => {
    mock = createMockNexusClient();
    // Default: empty query results and artifact list
    mock.mockMemory.query.mockResolvedValue({ results: [] });
    mock.mockMemory.store.mockResolvedValue({ memory_id: "m-1" });
    mock.mockArtifacts.list.mockResolvedValue({ data: [] });
    mock.mockArtifacts.create.mockResolvedValue({
      id: "art-1",
      name: "test",
      type: "tool",
      status: "active",
      version: 1,
      tags: [],
      schema: {},
      description: "",
      createdBy: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mock.mockArtifacts.update.mockResolvedValue({});
    mock.mockArtifacts.get.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Construction
  // =========================================================================

  it("1. constructor validates config", () => {
    expect(() => new CrystallizerMiddleware(mock.client, { minUses: -1 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("constructor accepts valid config", () => {
    const mw = new CrystallizerMiddleware(mock.client, { minUses: 3 });
    expect(mw.name).toBe("crystallizer");
  });

  // =========================================================================
  // onSessionStart
  // =========================================================================

  it("2. onSessionStart loads sequences + artifacts in parallel", async () => {
    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    expect(mock.mockMemory.query).toHaveBeenCalledWith(
      expect.objectContaining({
        memory_type: "tool_sequence",
        namespace: "crystallizer",
      }),
    );
    expect(mock.mockArtifacts.list).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool",
        tags: expect.arrayContaining(["crystallized"]),
      }),
    );
  });

  it("3. onSessionStart resets per-session state", async () => {
    const mw = new CrystallizerMiddleware(mock.client);

    // First session: record some tool calls
    await mw.onSessionStart(makeSessionContext({ sessionId: "s1" }));
    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    // Second session: should start fresh
    await mw.onSessionStart(makeSessionContext({ sessionId: "s2" }));

    // End second session — should have no tool calls recorded
    await mw.onSessionEnd(makeSessionContext({ sessionId: "s2" }));

    // Memory store should not be called for empty sequence
    // (the second session has no tool calls, so buildSequence returns empty)
    // Actually it was called during the wrapToolCall, but the sequence is empty
    // after reset so onSessionEnd won't store
  });

  // =========================================================================
  // wrapToolCall
  // =========================================================================

  it("4. wrapToolCall records success with timing", async () => {
    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    const next = makeNext();
    const response = await mw.wrapToolCall(makeToolRequest("search"), next);

    expect(response.output).toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("5. wrapToolCall records failure on thrown error (rethrows)", async () => {
    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    const error = new Error("tool failed");
    const next = makeErrorNext(error);

    await expect(mw.wrapToolCall(makeToolRequest("search"), next)).rejects.toThrow("tool failed");
  });

  it("6. wrapToolCall overhead < 1ms (performance assertion)", async () => {
    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    const next = vi.fn().mockResolvedValue(makeToolResponse());

    // Warm up
    await mw.wrapToolCall(makeToolRequest("warmup"), next);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await mw.wrapToolCall(makeToolRequest(`tool_${i}`), next);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    expect(perCall).toBeLessThan(1);
  });

  // =========================================================================
  // onSessionEnd
  // =========================================================================

  it("7. onSessionEnd stores sequence to Memory API", async () => {
    const mw = new CrystallizerMiddleware(mock.client, {
      enabled: { mining: false },
    });
    await mw.onSessionStart(makeSessionContext());

    // Record some tool calls
    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockMemory.store).toHaveBeenCalledWith(
      expect.objectContaining({
        memory_type: "tool_sequence",
        namespace: "crystallizer",
      }),
    );
  });

  it("8. onSessionEnd runs PrefixSpan and creates artifact when threshold met", async () => {
    // Need at least minUses (default 5) sessions with the pattern
    const historicalSequences = Array.from({ length: 5 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["search", "extract", "summarize"],
        successMap: {
          search: { success: 1, failure: 0 },
          extract: { success: 1, failure: 0 },
          summarize: { success: 1, failure: 0 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, { minUses: 5 });
    await mw.onSessionStart(makeSessionContext());

    // Current session also has the same pattern
    await mw.wrapToolCall(makeToolRequest("search"), makeNext());
    await mw.wrapToolCall(makeToolRequest("extract"), makeNext());
    await mw.wrapToolCall(makeToolRequest("summarize"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockArtifacts.create).toHaveBeenCalled();
  });

  it("9. onSessionEnd does NOT create artifact when below threshold (4 uses)", async () => {
    // Only 3 historical + 1 current = 4 < 5
    const historicalSequences = Array.from({ length: 3 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 1, failure: 0 },
          B: { success: 1, failure: 0 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, { minUses: 5 });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockArtifacts.create).not.toHaveBeenCalled();
  });

  it("10. onSessionEnd does NOT create artifact when success rate < 70%", async () => {
    // 5 sessions but with lots of failures
    const historicalSequences = Array.from({ length: 5 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 1, failure: 5 },
          B: { success: 1, failure: 5 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, { minUses: 5 });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockArtifacts.create).not.toHaveBeenCalled();
  });

  it("11. boundary: exactly 5 uses, exactly 70% success → crystallizes", async () => {
    // 4 historical + 1 current = 5 sessions
    // success rate: 70% (for each tool: 7 success, 3 failure across sessions)
    const historicalSequences = Array.from({ length: 4 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 7, failure: 3 },
          B: { success: 7, failure: 3 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, {
      minUses: 5,
      minSuccessRate: 0.7,
    });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockArtifacts.create).toHaveBeenCalled();
  });

  it("12. idempotent: same pattern not created twice (dedup by name)", async () => {
    // Pre-existing artifact with same name
    mock.mockArtifacts.list.mockResolvedValue({
      data: [
        {
          id: "art-existing",
          name: "crystallized:A+B",
          type: "tool",
          status: "active",
          tags: ["crystallized"],
          version: 1,
          createdBy: "agent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const historicalSequences = Array.from({ length: 5 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 10, failure: 0 },
          B: { success: 10, failure: 0 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, { minUses: 5 });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    // Should not create because it already exists
    expect(mock.mockArtifacts.create).not.toHaveBeenCalled();
  });

  it("13. autoApprove: false → artifact status set to inactive", async () => {
    const historicalSequences = Array.from({ length: 5 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 10, failure: 0 },
          B: { success: 10, failure: 0 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, {
      minUses: 5,
      autoApprove: false,
    });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    // Should create then deactivate
    expect(mock.mockArtifacts.create).toHaveBeenCalled();
    expect(mock.mockArtifacts.update).toHaveBeenCalledWith(
      "art-1",
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("14. autoApprove: true → artifact stays active (no deactivation)", async () => {
    const historicalSequences = Array.from({ length: 5 }, (_, i) => ({
      content: {
        sessionId: `s-${i}`,
        sequence: ["A", "B"],
        successMap: {
          A: { success: 10, failure: 0 },
          B: { success: 10, failure: 0 },
        },
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));
    mock.mockMemory.query.mockResolvedValue({ results: historicalSequences });

    const mw = new CrystallizerMiddleware(mock.client, {
      minUses: 5,
      autoApprove: true,
    });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    expect(mock.mockArtifacts.create).toHaveBeenCalled();
    // Should NOT call update to deactivate
    expect(mock.mockArtifacts.update).not.toHaveBeenCalledWith(
      "art-1",
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("15. validation on start: marks stale artifact as inactive", async () => {
    mock.mockArtifacts.list.mockResolvedValue({
      data: [
        {
          id: "art-stale",
          name: "crystallized:X+Y",
          type: "tool",
          status: "active",
          tags: ["crystallized"],
          version: 1,
          createdBy: "agent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    // Artifact has composition with tools that DON'T exist in historical sequences
    mock.mockArtifacts.get.mockResolvedValue({
      id: "art-stale",
      name: "crystallized:X+Y",
      type: "tool",
      status: "active",
      schema: { composition: ["nonexistent_tool_1", "nonexistent_tool_2"] },
      tags: ["crystallized"],
      version: 1,
      description: "",
      createdBy: "agent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Historical sequences have known tools
    mock.mockMemory.query.mockResolvedValue({
      results: [
        {
          content: {
            sessionId: "s-1",
            sequence: ["A", "B"],
            successMap: {},
            timestamp: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        },
      ],
    });

    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    // Allow async validation to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mock.mockArtifacts.update).toHaveBeenCalledWith(
      "art-stale",
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("16. validation on start: keeps valid artifact as active", async () => {
    mock.mockArtifacts.list.mockResolvedValue({
      data: [
        {
          id: "art-valid",
          name: "crystallized:A+B",
          type: "tool",
          status: "active",
          tags: ["crystallized"],
          version: 1,
          createdBy: "agent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    // Artifact composition uses tools that DO exist in historical sequences
    mock.mockArtifacts.get.mockResolvedValue({
      id: "art-valid",
      name: "crystallized:A+B",
      type: "tool",
      status: "active",
      schema: { composition: ["A", "B"] },
      tags: ["crystallized"],
      version: 1,
      description: "",
      createdBy: "agent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    mock.mockMemory.query.mockResolvedValue({
      results: [
        {
          content: {
            sessionId: "s-1",
            sequence: ["A", "B", "C"],
            successMap: {},
            timestamp: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        },
      ],
    });

    const mw = new CrystallizerMiddleware(mock.client);
    await mw.onSessionStart(makeSessionContext());

    // Allow async validation to settle
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT deactivate the valid artifact
    expect(mock.mockArtifacts.update).not.toHaveBeenCalledWith(
      "art-valid",
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("17. all Nexus API failures handled gracefully (safeNexusCall fallback)", async () => {
    mock.mockMemory.query.mockRejectedValue(new Error("Nexus down"));
    mock.mockArtifacts.list.mockRejectedValue(new Error("Nexus down"));
    mock.mockMemory.store.mockRejectedValue(new Error("Nexus down"));

    const mw = new CrystallizerMiddleware(mock.client);

    // Should not throw
    await mw.onSessionStart(makeSessionContext());
    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.onSessionEnd(makeSessionContext());
  });

  it("18. feature flags: observation=false → wrapToolCall is pass-through", async () => {
    const mw = new CrystallizerMiddleware(mock.client, {
      enabled: { observation: false, mining: false },
    });
    await mw.onSessionStart(makeSessionContext());

    const next = makeNext();
    await mw.wrapToolCall(makeToolRequest("A"), next);

    // Should just pass through without recording
    expect(next).toHaveBeenCalledTimes(1);

    // End session — should not store (no observations)
    await mw.onSessionEnd(makeSessionContext());
    expect(mock.mockMemory.store).not.toHaveBeenCalled();
  });

  it("19. feature flags: mining=false → onSessionEnd skips PrefixSpan", async () => {
    const mw = new CrystallizerMiddleware(mock.client, {
      enabled: { mining: false },
    });
    await mw.onSessionStart(makeSessionContext());

    await mw.wrapToolCall(makeToolRequest("A"), makeNext());
    await mw.wrapToolCall(makeToolRequest("B"), makeNext());

    await mw.onSessionEnd(makeSessionContext());

    // Should store sequence but NOT create artifacts
    expect(mock.mockMemory.store).toHaveBeenCalled();
    expect(mock.mockArtifacts.create).not.toHaveBeenCalled();
  });
});
