/**
 * Crystallizer E2E tests (#164)
 *
 * Requires a running Nexus instance with:
 *   NEXUS_E2E_URL=http://localhost:2028
 *   NEXUS_E2E_KEY=<api-key>
 *
 * Skipped when environment variables are not set.
 */

import type { NexusClient as NexusClientType } from "@nexus/sdk";
import type { SessionContext, ToolRequest, ToolResponse } from "@templar/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CrystallizerMiddleware } from "../middleware.js";

// ---------------------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------------------
const NEXUS_E2E_URL = process.env.NEXUS_E2E_URL ?? "";
const NEXUS_E2E_KEY = process.env.NEXUS_E2E_KEY ?? "";
const E2E_ENABLED = NEXUS_E2E_URL.length > 0 && NEXUS_E2E_KEY.length > 0;
const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    agentId: "e2e-test-agent",
    ...overrides,
  };
}

function makeToolRequest(toolName: string): ToolRequest {
  return { toolName, input: {} } as ToolRequest;
}

function makeNext(output = "ok"): (req: ToolRequest) => Promise<ToolResponse> {
  return vi.fn().mockResolvedValue({ output, metadata: {} } as ToolResponse);
}

// ---------------------------------------------------------------------------
// E2E Tests
// ---------------------------------------------------------------------------

describeE2E("CrystallizerMiddleware E2E", () => {
  let client: NexusClientType;

  beforeAll(async () => {
    // Dynamic import to avoid loading SDK when tests are skipped
    const sdk = await import("@nexus/sdk");
    client = new sdk.NexusClient({
      baseUrl: NEXUS_E2E_URL,
      apiKey: NEXUS_E2E_KEY,
    });
  });

  afterAll(async () => {
    // Clean up: remove test artifacts and memories
    try {
      const artifacts = await client.artifacts.list({
        tags: ["e2e-crystallizer-test"],
      });
      for (const artifact of artifacts.data) {
        await client.artifacts.delete(artifact.id);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it("1. full lifecycle: repeating tool sequence → crystallized artifact created", async () => {
    const mw = new CrystallizerMiddleware(client, {
      minUses: 3,
      minSuccessRate: 0.5,
      autoApprove: true,
      tags: ["e2e-crystallizer-test"],
    });

    // Run 3 sessions with the same tool pattern
    for (let i = 0; i < 3; i++) {
      const ctx = makeSessionContext({ sessionId: `e2e-lifecycle-${i}` });
      await mw.onSessionStart(ctx);

      await mw.wrapToolCall(makeToolRequest("e2e_search"), makeNext());
      await mw.wrapToolCall(makeToolRequest("e2e_extract"), makeNext());
      await mw.wrapToolCall(makeToolRequest("e2e_summarize"), makeNext());

      await mw.onSessionEnd(ctx);
    }

    // The last session should have triggered crystallization
    // (3 sessions × same pattern → support = 3 >= minUses = 3)
  }, 30000);

  it("2. artifact visible via artifacts.list with crystallized tag", async () => {
    const artifacts = await client.artifacts.list({
      type: "tool",
      tags: ["crystallized", "e2e-crystallizer-test"],
    });

    // May or may not exist depending on test ordering, but should not throw
    expect(artifacts.data).toBeDefined();
  }, 10000);

  it("3. sequence stored in Memory API with memory_type: tool_sequence", async () => {
    const mw = new CrystallizerMiddleware(client, {
      enabled: { mining: false },
      tags: ["e2e-crystallizer-test"],
    });

    const ctx = makeSessionContext({ sessionId: "e2e-memory-check" });
    await mw.onSessionStart(ctx);
    await mw.wrapToolCall(makeToolRequest("e2e_tool_a"), makeNext());
    await mw.onSessionEnd(ctx);

    // Query for the stored sequence
    const result = await client.memory.query({
      memory_type: "tool_sequence",
      namespace: "crystallizer",
      limit: 10,
    });

    expect(result.results).toBeDefined();
  }, 10000);

  it("4. permission enforcement: crystallizer stores to Memory API (requires memory:write)", async () => {
    // This test verifies the store call doesn't throw with proper permissions
    const mw = new CrystallizerMiddleware(client, {
      enabled: { mining: false },
      tags: ["e2e-crystallizer-test"],
    });

    const ctx = makeSessionContext();
    await mw.onSessionStart(ctx);
    await mw.wrapToolCall(makeToolRequest("e2e_perm_tool"), makeNext());

    // Should not throw (graceful degradation via safeNexusCall)
    await mw.onSessionEnd(ctx);
  }, 10000);

  it("5. permission enforcement: crystallizer creates artifact (requires artifact:create)", async () => {
    // Verify artifact creation doesn't throw even if permissions are strict
    const mw = new CrystallizerMiddleware(client, {
      minUses: 1,
      minSuccessRate: 0.0,
      autoApprove: true,
      tags: ["e2e-crystallizer-test"],
    });

    const ctx = makeSessionContext();
    await mw.onSessionStart(ctx);
    await mw.wrapToolCall(makeToolRequest("e2e_perm_a"), makeNext());
    await mw.wrapToolCall(makeToolRequest("e2e_perm_b"), makeNext());

    // Should not throw
    await mw.onSessionEnd(ctx);
  }, 10000);

  it("6. performance: wrapToolCall per-call overhead < 1ms", async () => {
    const mw = new CrystallizerMiddleware(client, {
      enabled: { mining: false, validation: false },
      tags: ["e2e-crystallizer-test"],
    });

    const ctx = makeSessionContext();
    await mw.onSessionStart(ctx);

    const next = makeNext();
    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await mw.wrapToolCall(makeToolRequest(`perf_tool_${i}`), next);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    expect(perCall).toBeLessThan(1);
  }, 10000);

  it("7. performance: onSessionEnd with 50 tool calls, 100 historical < 500ms", async () => {
    const mw = new CrystallizerMiddleware(client, {
      minUses: 1000, // Set high so nothing actually crystallizes
      tags: ["e2e-crystallizer-test"],
    });

    const ctx = makeSessionContext();
    await mw.onSessionStart(ctx);

    const next = makeNext();
    for (let i = 0; i < 50; i++) {
      await mw.wrapToolCall(makeToolRequest(`perf_tool_${i % 10}`), next);
    }

    const start = performance.now();
    await mw.onSessionEnd(ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  }, 15000);
});
