import type { IncomingMessage } from "node:http";
import type { GatewayFrame } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { GatewayServer, type WebSocketLike, type WebSocketServerLike } from "../server.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function createMockWs(): WebSocketLike & {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
} {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  return {
    handlers,
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => unknown) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
  };
}

function createMockWss(): WebSocketServerLike & {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
  simulateConnection: (ws: WebSocketLike, req: Partial<IncomingMessage>) => void;
} {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  return {
    handlers,
    clients: new Set(),
    on(event: string, handler: (...args: unknown[]) => unknown) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
    close(cb?: (err?: Error) => void) {
      cb?.();
    },
    simulateConnection(ws: WebSocketLike, req: Partial<IncomingMessage>) {
      const connectionHandlers = handlers.get("connection") ?? [];
      for (const h of connectionHandlers) {
        h(ws, req);
      }
    },
  };
}

function createMockFactory(wss: WebSocketServerLike) {
  return vi.fn().mockReturnValue(wss);
}

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
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

      // Simulate message
      const frame: GatewayFrame = { kind: "heartbeat.pong", timestamp: Date.now() };
      const messageHandlers = ws.handlers.get("message") ?? [];
      for (const h of messageHandlers) {
        h(JSON.stringify(frame));
      }

      expect(frameHandler).toHaveBeenCalledWith(
        "node-1",
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
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

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
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

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
    it("fires connect handler on new connection", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      const connectHandler = vi.fn();
      server.onConnect(connectHandler);
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

      expect(connectHandler).toHaveBeenCalledWith("node-1");
      expect(server.connectionCount).toBe(1);

      await server.stop();
    });

    it("fires disconnect handler on close", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );

      const disconnectHandler = vi.fn();
      server.onDisconnect(disconnectHandler);
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

      // Simulate close
      const closeHandlers = ws.handlers.get("close") ?? [];
      for (const h of closeHandlers) {
        h(1000, "Normal closure");
      }

      expect(disconnectHandler).toHaveBeenCalledWith("node-1", 1000, "Normal closure");
      expect(server.connectionCount).toBe(0);

      await server.stop();
    });
  });

  // -------------------------------------------------------------------------
  // sendFrame
  // -------------------------------------------------------------------------

  describe("sendFrame()", () => {
    it("sends JSON frame to connected node", async () => {
      const wss = createMockWss();
      const server = new GatewayServer(
        { port: 0, validateToken: () => true },
        createMockFactory(wss),
      );
      await server.start();

      const ws = createMockWs();
      wss.simulateConnection(ws, {
        url: "/?nodeId=node-1",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage);

      const frame: GatewayFrame = { kind: "heartbeat.ping", timestamp: Date.now() };
      server.sendFrame("node-1", frame);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));

      await server.stop();
    });

    it("no-op for unknown nodeId", async () => {
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
});
