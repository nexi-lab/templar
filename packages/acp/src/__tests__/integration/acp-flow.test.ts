import type { SessionNotification } from "@agentclientprotocol/sdk";
import { ClientSideConnection, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ACPRunHandler } from "../../handler.js";
import { ACPServer } from "../../server.js";
import type { MemoryTransportPair } from "../helpers/memory-transport.js";
import { createMemoryTransportPair } from "../helpers/memory-transport.js";

describe("ACP full protocol round-trip", () => {
  let pair: MemoryTransportPair;

  afterEach(() => {
    pair?.destroy();
  });

  it("completes full lifecycle: init → session → prompt → cancel → disconnect", async () => {
    pair = createMemoryTransportPair();
    const receivedUpdates: SessionNotification[] = [];

    // Create handler that streams text chunks and a tool call
    const handler: ACPRunHandler = async (_input, _context, emit, _signal) => {
      // Emit a plan
      emit({
        sessionUpdate: "plan",
        entries: [
          {
            content: "Read the file",
            status: "in_progress",
            priority: "high",
          },
        ],
      });

      // Emit text chunk
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "I'll help with that. " },
      });

      // Emit a tool call
      emit({
        sessionUpdate: "tool_call",
        toolCallId: "tc_1",
        title: "Reading main.ts",
        kind: "read",
        status: "pending",
        locations: [{ path: "/src/main.ts" }],
      });

      // Complete the tool call
      emit({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc_1",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "file contents here" },
          },
        ],
      });

      // Emit final text
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Done!" },
      });

      return "end_turn";
    };

    const server = new ACPServer({
      handler,
      config: {
        agentName: "IntegrationTestAgent",
        agentVersion: "1.0.0",
        maxSessions: 3,
      },
      transport: pair.agentTransport,
    });

    const client = new ClientSideConnection(
      (_agent) => ({
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "selected", optionId: "allow" },
        }),
        sessionUpdate: vi.fn(async (params: SessionNotification) => {
          receivedUpdates.push(params);
        }),
      }),
      pair.clientStream,
    );

    // 1. Connect server
    await server.connect();
    expect(server.isConnected).toBe(true);

    // 2. Initialize
    const initResp = await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });
    expect(initResp.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(initResp.agentInfo?.name).toBe("IntegrationTestAgent");
    expect(initResp.agentInfo?.version).toBe("1.0.0");

    // 3. Create session
    const sessionResp = await client.newSession({
      cwd: "/workspace",
      mcpServers: [],
    });
    expect(sessionResp.sessionId).toBeDefined();
    const { sessionId } = sessionResp;

    // 4. Send prompt
    const promptResp = await client.prompt({
      sessionId,
      prompt: [{ type: "text", text: "Fix the authentication bug" }],
    });
    expect(promptResp.stopReason).toBe("end_turn");

    // 5. Verify updates were received
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedUpdates.length).toBeGreaterThanOrEqual(4);

    // Verify update types
    const updateTypes = receivedUpdates.map((u) => u.update.sessionUpdate);
    expect(updateTypes).toContain("plan");
    expect(updateTypes).toContain("agent_message_chunk");
    expect(updateTypes).toContain("tool_call");
    expect(updateTypes).toContain("tool_call_update");

    // 6. Verify all updates reference the correct session
    for (const update of receivedUpdates) {
      expect(update.sessionId).toBe(sessionId);
    }

    // 7. Create second session (verify multi-session)
    const session2 = await client.newSession({
      cwd: "/workspace2",
      mcpServers: [],
    });
    expect(session2.sessionId).toBeDefined();
    expect(session2.sessionId).not.toBe(sessionId);

    // 8. Disconnect
    await server.disconnect();
    expect(server.isConnected).toBe(false);
  });

  it("handles cancellation during a prompt", async () => {
    pair = createMemoryTransportPair();

    // Handler that waits and respects cancellation
    const handler: ACPRunHandler = async (_input, _context, emit, signal) => {
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Starting..." },
      });

      // Wait for a long time (will be cancelled)
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 10000);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
          });
        });
      } catch {
        return "cancelled";
      }

      return "end_turn";
    };

    const server = new ACPServer({
      handler,
      transport: pair.agentTransport,
    });

    const client = new ClientSideConnection(
      (_agent) => ({
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "cancelled" },
        }),
        sessionUpdate: vi.fn(),
      }),
      pair.clientStream,
    );

    await server.connect();
    await client.initialize({ protocolVersion: PROTOCOL_VERSION });
    const { sessionId } = await client.newSession({
      cwd: "/tmp",
      mcpServers: [],
    });

    // Start prompt (don't await)
    const promptPromise = client.prompt({
      sessionId,
      prompt: [{ type: "text", text: "Do something long" }],
    });

    // Wait for handler to start
    await new Promise((r) => setTimeout(r, 50));

    // Cancel
    await client.cancel({ sessionId });

    // Should resolve with cancelled
    const resp = await promptPromise;
    expect(resp.stopReason).toBe("cancelled");

    await server.disconnect();
  });

  it("handles empty prompt gracefully", async () => {
    pair = createMemoryTransportPair();

    const handler: ACPRunHandler = async (_input, _context, emit, _signal) => {
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "No input received." },
      });
      return "end_turn";
    };

    const server = new ACPServer({
      handler,
      transport: pair.agentTransport,
    });

    const client = new ClientSideConnection(
      (_agent) => ({
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "cancelled" },
        }),
        sessionUpdate: vi.fn(),
      }),
      pair.clientStream,
    );

    await server.connect();
    await client.initialize({ protocolVersion: PROTOCOL_VERSION });
    const { sessionId } = await client.newSession({
      cwd: "/tmp",
      mcpServers: [],
    });

    const resp = await client.prompt({
      sessionId,
      prompt: [],
    });

    expect(resp.stopReason).toBe("end_turn");
    await server.disconnect();
  });
});
