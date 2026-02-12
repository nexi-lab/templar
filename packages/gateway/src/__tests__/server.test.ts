import type { IncomingMessage } from "node:http";
import type { GatewayFrame } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { GatewayServer } from "../server.js";
import { createMockFactory, createMockWs, createMockWss } from "./helpers.js";

describe("GatewayServer", () => {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  describe("authentication", () => {
    it("rejects connection without Authorization header", async () => {
      let verifyClientFn: ((...args: unknown[]) => unknown) | undefined;
      const factory = vi
        .fn()
        .mockImplementation((opts: { verifyClient: (...args: unknown[]) => unknown }) => {
          verifyClientFn = opts.verifyClient;
          return createMockWss();
        });

      const server = new GatewayServer({ port: 0, validateToken: () => true }, factory);
      await server.start();

      const callback = vi.fn();
      verifyClientFn?.({ req: { headers: {} } }, callback);
      expect(callback).toHaveBeenCalledWith(false, 401, "Missing or invalid Authorization header");

      await server.stop();
    });

    it("rejects connection with non-Bearer token", async () => {
      let verifyClientFn: ((...args: unknown[]) => unknown) | undefined;
      const factory = vi
        .fn()
        .mockImplementation((opts: { verifyClient: (...args: unknown[]) => unknown }) => {
          verifyClientFn = opts.verifyClient;
          return createMockWss();
        });

      const server = new GatewayServer({ port: 0, validateToken: () => true }, factory);
      await server.start();

      const callback = vi.fn();
      verifyClientFn?.({ req: { headers: { authorization: "Basic abc" } } }, callback);
      expect(callback).toHaveBeenCalledWith(false, 401, "Missing or invalid Authorization header");

      await server.stop();
    });

    it("accepts connection with valid Bearer token", async () => {
      let verifyClientFn: ((...args: unknown[]) => unknown) | undefined;
      const factory = vi
        .fn()
        .mockImplementation((opts: { verifyClient: (...args: unknown[]) => unknown }) => {
          verifyClientFn = opts.verifyClient;
          return createMockWss();
        });

      const server = new GatewayServer(
        { port: 0, validateToken: (t) => t === "valid-token" },
        factory,
      );
      await server.start();

      const callback = vi.fn();
      verifyClientFn?.({ req: { headers: { authorization: "Bearer valid-token" } } }, callback);
      expect(callback).toHaveBeenCalledWith(true, undefined, undefined);

      await server.stop();
    });

    it("rejects connection with invalid token", async () => {
      let verifyClientFn: ((...args: unknown[]) => unknown) | undefined;
      const factory = vi
        .fn()
        .mockImplementation((opts: { verifyClient: (...args: unknown[]) => unknown }) => {
          verifyClientFn = opts.verifyClient;
          return createMockWss();
        });

      const server = new GatewayServer(
        { port: 0, validateToken: (t) => t === "valid-token" },
        factory,
      );
      await server.start();

      const callback = vi.fn();
      verifyClientFn?.({ req: { headers: { authorization: "Bearer wrong-token" } } }, callback);
      expect(callback).toHaveBeenCalledWith(false, 403, "Forbidden");

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Frame handling
  // -------------------------------------------------------------------------

  describe("frame handling", () => {
    it("dispatches valid frames to handlers", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      const frameHandler = vi.fn();
      server.onFrame(frameHandler);
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      // Simulate message
      const frame: GatewayFrame = { kind: "heartbeat.pong", timestamp: Date.now() };
      const messageHandlers = ws.handlers.get("message") ?? [];
      for (const h of messageHandlers) {
        h(JSON.stringify(frame));
      }

      // Connection ID is ephemeral (conn-X), not a node identity
      expect(frameHandler).toHaveBeenCalledWith(
        expect.stringMatching(/^conn-\d+$/),
        expect.objectContaining({ kind: "heartbeat.pong" }),
      );

      await server.stop();
    });

    it("sends error for invalid frames", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      const messageHandlers = ws.handlers.get("message") ?? [];
      for (const h of messageHandlers) {
        h(JSON.stringify({ kind: "unknown" }));
      }

      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"kind":"error"'));

      await server.stop();
    });

    it("sends error for non-JSON messages", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      const messageHandlers = ws.handlers.get("message") ?? [];
      for (const h of messageHandlers) {
        h("not json");
      }

      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Parse error"));

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Connection / Disconnect
  // -------------------------------------------------------------------------

  describe("connection lifecycle", () => {
    it("fires connect handler with ephemeral connection ID", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      const connectHandler = vi.fn();
      server.onConnect(connectHandler);
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      // Connection IDs are ephemeral (conn-X), not derived from client input
      expect(connectHandler).toHaveBeenCalledWith(expect.stringMatching(/^conn-\d+$/));
      expect(server.connectionCount).toBe(1);

      await server.stop();
    });

    it("fires disconnect handler on close", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      let connectionId: string | undefined;
      server.onConnect((id) => {
        connectionId = id;
      });
      const disconnectHandler = vi.fn();
      server.onDisconnect(disconnectHandler);
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      // Simulate close
      const closeHandlers = ws.handlers.get("close") ?? [];
      for (const h of closeHandlers) {
        h(1000, "Normal closure");
      }

      expect(disconnectHandler).toHaveBeenCalledWith(connectionId, 1000, "Normal closure");
      expect(server.connectionCount).toBe(0);

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // sendFrame
  // -------------------------------------------------------------------------

  describe("sendFrame()", () => {
    it("sends JSON frame to connected node via connection ID", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      let connectionId: string | undefined;
      server.onConnect((id) => {
        connectionId = id;
      });
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      const frame: GatewayFrame = { kind: "heartbeat.ping", timestamp: Date.now() };
      server.sendFrame(connectionId!, frame);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));

      await server.stop();
    });

    it("no-op for unknown connection ID", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );
      await server.start();

      // Should not throw
      server.sendFrame("unknown", { kind: "heartbeat.ping", timestamp: Date.now() });

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  describe("rate limiting", () => {
    it("rejects frames when rate limit is exceeded", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true, maxFramesPerSecond: 2 },
        createMockFactory(wss),
      );
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws);

      const messageHandlers = ws.handlers.get("message") ?? [];
      const frame: GatewayFrame = { kind: "heartbeat.pong", timestamp: Date.now() };

      // Send 3 frames — 3rd should be rate limited
      for (let i = 0; i < 3; i++) {
        for (const h of messageHandlers) {
          h(JSON.stringify(frame));
        }
      }

      // Should have a rate limit error in the sent frames
      const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
      const rateLimitError = calls.find((c) => String(c[0]).includes("Rate limited"));
      expect(rateLimitError).toBeDefined();

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Max connections
  // -------------------------------------------------------------------------

  describe("max connections", () => {
    it("rejects connections when maxConnections is reached", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true, maxConnections: 1 },
        createMockFactory(wss),
      );
      await server.start();

      // First connection succeeds
      const ws1 = createMockWs();
      wss.simulateConnection(ws1);
      expect(server.connectionCount).toBe(1);

      // Second connection is rejected
      const ws2 = createMockWs();
      wss.simulateConnection(ws2);
      expect(ws2.close).toHaveBeenCalledWith(1013, "Maximum connections reached");
      expect(server.connectionCount).toBe(1); // Still 1

      await server.stop();
    });
  });
});
