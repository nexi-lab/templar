import type { GatewayFrame } from "@templar/gateway-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type WebSocketClientLike, WsClient, type WsClientFactory } from "../ws-client.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function createMockWs(): WebSocketClientLike & {
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
  _simulateOpen: () => void;
  _simulateMessage: (data: string) => void;
  _simulateClose: (code: number, reason: string) => void;
  _simulateError: (error: Error) => void;
  _sent: string[];
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const sent: string[] = [];

  const ws = {
    readyState: 0, // CONNECTING
    _listeners: listeners,
    _sent: sent,

    send(data: string) {
      sent.push(data);
    },

    close(code?: number, _reason?: string) {
      ws.readyState = 3; // CLOSED
      const handlers = listeners.get("close") ?? [];
      for (const h of handlers) {
        h(code ?? 1000, "");
      }
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, handler]);
    },

    _simulateOpen() {
      ws.readyState = 1; // OPEN
      const handlers = listeners.get("open") ?? [];
      for (const h of handlers) h();
    },

    _simulateMessage(data: string) {
      const handlers = listeners.get("message") ?? [];
      for (const h of handlers) h(data);
    },

    _simulateClose(code: number, reason: string) {
      ws.readyState = 3; // CLOSED
      const handlers = listeners.get("close") ?? [];
      for (const h of handlers) h(code, reason);
    },

    _simulateError(error: Error) {
      const handlers = listeners.get("error") ?? [];
      for (const h of handlers) h(error);
    },
  };

  return ws;
}

describe("WsClient", () => {
  let mockWs: ReturnType<typeof createMockWs>;
  let factory: WsClientFactory;
  let client: WsClient;

  beforeEach(() => {
    mockWs = createMockWs();
    factory = vi.fn((_url: string, _options) => mockWs);
    client = new WsClient(factory);
  });

  describe("connect", () => {
    it("should resolve when WebSocket opens", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "test-token");
      mockWs._simulateOpen();
      await expect(connectPromise).resolves.toBeUndefined();
    });

    it("should pass auth header to factory", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "my-secret");
      mockWs._simulateOpen();
      await connectPromise;

      expect(factory).toHaveBeenCalledWith("ws://localhost:18789/?nodeId=", {
        headers: { Authorization: "Bearer my-secret" },
      });
    });

    it("should reject when WebSocket errors during connect", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateError(new Error("Connection refused"));
      await expect(connectPromise).rejects.toThrow("Connection refused");
    });

    it("should reject when WebSocket closes during connect", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateClose(1006, "Abnormal closure");
      await expect(connectPromise).rejects.toThrow();
    });

    it("should dispose previous instance on subsequent connect", async () => {
      const mockWs2 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        return callCount === 1 ? mockWs : mockWs2;
      };
      const multiClient = new WsClient(multiFactory);

      // First connect
      const p1 = multiClient.connect("ws://localhost:18789", "t");
      mockWs._simulateOpen();
      await p1;

      // Second connect should dispose first
      const p2 = multiClient.connect("ws://localhost:18789", "t");
      mockWs2._simulateOpen();
      await p2;

      // First WS should have been closed
      expect(mockWs.readyState).toBe(3); // CLOSED
    });
  });

  describe("send", () => {
    it("should serialize frame and send when connected", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      const frame: GatewayFrame = {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      };
      const result = client.send(frame);

      expect(result).toBe(true);
      expect(mockWs._sent).toHaveLength(1);
      expect(JSON.parse(mockWs._sent[0] ?? "")).toEqual(frame);
    });

    it("should return false when not connected", () => {
      const frame: GatewayFrame = {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      };
      const result = client.send(frame);
      expect(result).toBe(false);
    });
  });

  describe("onMessage", () => {
    it("should dispatch valid frames to handler", async () => {
      const handler = vi.fn();
      client.onMessage(handler);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      const frame: GatewayFrame = {
        kind: "node.register.ack",
        nodeId: "test-node",
        sessionId: "session-1",
      };
      mockWs._simulateMessage(JSON.stringify(frame));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(frame);
    });

    it("should not dispatch invalid JSON", async () => {
      const handler = vi.fn();
      const errorHandler = vi.fn();
      client.onMessage(handler);
      client.onError(errorHandler);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      mockWs._simulateMessage("not-json{{{");

      expect(handler).not.toHaveBeenCalled();
    });

    it("should not dispatch invalid frames", async () => {
      const handler = vi.fn();
      client.onMessage(handler);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      mockWs._simulateMessage(JSON.stringify({ kind: "invalid.frame" }));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("onClose", () => {
    it("should fire close handler on disconnect", async () => {
      const handler = vi.fn();
      client.onClose(handler);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      mockWs._simulateClose(1001, "Going away");

      expect(handler).toHaveBeenCalledWith(1001, "Going away");
    });
  });

  describe("onError", () => {
    it("should fire error handler on WS error", async () => {
      const handler = vi.fn();
      client.onError(handler);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      mockWs._simulateError(new Error("Network error"));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
  });

  describe("state", () => {
    it("should report isConnected correctly", async () => {
      expect(client.isConnected).toBe(false);

      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      expect(client.isConnected).toBe(true);

      mockWs._simulateClose(1000, "Normal");
      expect(client.isConnected).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should close connection and clear state", async () => {
      const connectPromise = client.connect("ws://localhost:18789", "token");
      mockWs._simulateOpen();
      await connectPromise;

      client.dispose();
      expect(client.isConnected).toBe(false);
    });
  });
});
