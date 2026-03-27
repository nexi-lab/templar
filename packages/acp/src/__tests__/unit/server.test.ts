import type { SessionNotification } from "@agentclientprotocol/sdk";
import { ClientSideConnection, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACPServer } from "../../server.js";
import type { MemoryTransportPair } from "../helpers/memory-transport.js";
import { createMemoryTransportPair } from "../helpers/memory-transport.js";
import { createMockHandler } from "../helpers/mock-handler.js";

describe("ACPServer", () => {
  let pair: MemoryTransportPair;

  afterEach(() => {
    pair?.destroy();
  });

  function createServerAndClient(
    handlerOpts?: Parameters<typeof createMockHandler>[0],
    serverConfig?: Partial<Record<string, unknown>>,
  ) {
    pair = createMemoryTransportPair();
    const handler = createMockHandler(handlerOpts);
    const server = new ACPServer({
      handler,
      ...(serverConfig ? { config: serverConfig } : {}),
      transport: pair.agentTransport,
    });

    const updates: SessionNotification[] = [];
    const client = new ClientSideConnection(
      (_agent) => ({
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "selected", optionId: "allow" },
        }),
        sessionUpdate: vi.fn(async (params: SessionNotification) => {
          updates.push(params);
        }),
      }),
      pair.clientStream,
    );

    return { server, client, handler, updates };
  }

  describe("constructor", () => {
    it("validates config on construction", () => {
      expect(
        () =>
          new ACPServer({
            handler: createMockHandler(),
            config: { maxSessions: -1 },
          }),
      ).toThrow();
    });

    it("accepts valid config with defaults", () => {
      const server = new ACPServer({ handler: createMockHandler() });
      expect(server.isConnected).toBe(false);
    });
  });

  describe("connect/disconnect", () => {
    it("connects and sets isConnected to true", async () => {
      const { server } = createServerAndClient();
      await server.connect();
      expect(server.isConnected).toBe(true);
    });

    it("connect is idempotent", async () => {
      const { server } = createServerAndClient();
      await server.connect();
      await server.connect(); // Should not throw
      expect(server.isConnected).toBe(true);
    });

    it("disconnect sets isConnected to false", async () => {
      const { server } = createServerAndClient();
      await server.connect();
      await server.disconnect();
      expect(server.isConnected).toBe(false);
    });

    it("disconnect is idempotent", async () => {
      const { server } = createServerAndClient();
      await server.connect();
      await server.disconnect();
      await server.disconnect(); // Should not throw
      expect(server.isConnected).toBe(false);
    });
  });

  describe("initialize", () => {
    it("returns correct protocol version and agent info", async () => {
      const { server, client } = createServerAndClient(undefined, {
        agentName: "TestAgent",
        agentVersion: "1.0.0",
      });
      await server.connect();

      const response = await client.initialize({
        protocolVersion: PROTOCOL_VERSION,
      });

      expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(response.agentInfo?.name).toBe("TestAgent");
      expect(response.agentInfo?.version).toBe("1.0.0");
    });

    it("returns agent capabilities based on config", async () => {
      const { server, client } = createServerAndClient(undefined, {
        acceptImages: true,
        acceptAudio: false,
        acceptResources: true,
        supportLoadSession: false,
      });
      await server.connect();

      const response = await client.initialize({
        protocolVersion: PROTOCOL_VERSION,
      });

      expect(response.agentCapabilities?.loadSession).toBe(false);
      expect(response.agentCapabilities?.promptCapabilities?.image).toBe(true);
      expect(response.agentCapabilities?.promptCapabilities?.audio).toBe(false);
      expect(response.agentCapabilities?.promptCapabilities?.embeddedContext).toBe(true);
    });
  });

  describe("session/new", () => {
    it("creates a session and returns a session ID", async () => {
      const { server, client } = createServerAndClient();
      await server.connect();
      await client.initialize({ protocolVersion: PROTOCOL_VERSION });

      const response = await client.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      expect(response.sessionId).toBeDefined();
      expect(typeof response.sessionId).toBe("string");
    });
  });

  describe("session/prompt", () => {
    it("calls handler with prompt blocks and returns stop reason", async () => {
      const { server, client, handler } = createServerAndClient({
        text: "Response text",
        stopReason: "end_turn",
      });
      await server.connect();
      await client.initialize({ protocolVersion: PROTOCOL_VERSION });
      const { sessionId } = await client.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      const response = await client.prompt({
        sessionId,
        prompt: [{ type: "text", text: "Hello agent" }],
      });

      expect(response.stopReason).toBe("end_turn");
      expect(handler).toHaveBeenCalledOnce();

      // Verify handler received correct input
      const callArgs = handler.mock.calls[0];
      expect(callArgs?.[0]?.sessionId).toBe(sessionId);
      expect(callArgs?.[0]?.prompt).toEqual([{ type: "text", content: "Hello agent" }]);
    });

    it("streams session updates from handler", async () => {
      const { server, client, updates } = createServerAndClient({
        updates: [
          {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Part 1" },
          },
          {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Part 2" },
          },
        ],
      });
      await server.connect();
      await client.initialize({ protocolVersion: PROTOCOL_VERSION });
      const { sessionId } = await client.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      await client.prompt({
        sessionId,
        prompt: [{ type: "text", text: "Go" }],
      });

      // Wait a tick for notifications to arrive
      await new Promise((r) => setTimeout(r, 50));

      expect(updates.length).toBeGreaterThanOrEqual(2);
      expect(updates[0]?.update.sessionUpdate).toBe("agent_message_chunk");
    });

    it("returns error for non-existent session", async () => {
      const { server, client } = createServerAndClient();
      await server.connect();
      await client.initialize({ protocolVersion: PROTOCOL_VERSION });

      await expect(
        client.prompt({
          sessionId: "non-existent",
          prompt: [{ type: "text", text: "Hello" }],
        }),
      ).rejects.toThrow();
    });
  });

  describe("session/cancel", () => {
    it("cancels an in-flight prompt", async () => {
      const { server, client } = createServerAndClient({
        delay: 5000, // Long delay — will be cancelled
      });
      await server.connect();
      await client.initialize({ protocolVersion: PROTOCOL_VERSION });
      const { sessionId } = await client.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      // Start prompt (don't await)
      const promptPromise = client.prompt({
        sessionId,
        prompt: [{ type: "text", text: "Do something slow" }],
      });

      // Give it a moment to start
      await new Promise((r) => setTimeout(r, 50));

      // Cancel
      await client.cancel({ sessionId });

      // Prompt should resolve with "cancelled"
      const response = await promptPromise;
      expect(response.stopReason).toBe("cancelled");
    });
  });
});
