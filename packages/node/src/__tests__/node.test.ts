import type { GatewayFrame, LaneMessage } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { TemplarNode } from "../node.js";
import type { NodeConfig } from "../types.js";
import type { WebSocketClientLike, WsClientFactory } from "../ws-client.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function createMockWs(): WebSocketClientLike & {
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
  _simulateOpen: () => void;
  _simulateMessage: (frame: GatewayFrame) => void;
  _simulateClose: (code: number, reason: string) => void;
  _simulateError: (error: Error) => void;
  _sent: GatewayFrame[];
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const sent: GatewayFrame[] = [];

  const ws: WebSocketClientLike & {
    _listeners: Map<string, Array<(...args: unknown[]) => void>>;
    _simulateOpen: () => void;
    _simulateMessage: (frame: GatewayFrame) => void;
    _simulateClose: (code: number, reason: string) => void;
    _simulateError: (error: Error) => void;
    _sent: GatewayFrame[];
  } = {
    readyState: 0,
    _listeners: listeners,
    _sent: sent,

    send(data: string) {
      sent.push(JSON.parse(data) as GatewayFrame);
    },

    close(code?: number, _reason?: string) {
      ws.readyState = 3;
      const handlers = listeners.get("close") ?? [];
      for (const h of handlers) h(code ?? 1000, "");
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, handler]);
    },

    _simulateOpen() {
      ws.readyState = 1;
      const handlers = listeners.get("open") ?? [];
      for (const h of handlers) h();
    },

    _simulateMessage(frame: GatewayFrame) {
      const handlers = listeners.get("message") ?? [];
      for (const h of handlers) h(JSON.stringify(frame));
    },

    _simulateClose(code: number, reason: string) {
      ws.readyState = 3;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush pending microtasks so async chains can progress */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeConfig(overrides?: Partial<NodeConfig>): NodeConfig {
  return {
    nodeId: "test-node-1",
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
    capabilities: {
      agentTypes: ["high"],
      tools: ["web-search"],
      maxConcurrency: 4,
      channels: ["slack"],
    },
    ...overrides,
  };
}

/**
 * Start a TemplarNode and complete the connect + register handshake.
 * Uses tick() to properly sequence the async promise chain.
 */
async function startAndConnect(
  node: TemplarNode,
  mockWs: ReturnType<typeof createMockWs>,
  sessionId = "session-1",
): Promise<void> {
  const startPromise = node.start();

  // Flush microtasks so resolveToken + wsClient.connect() run
  // and WS listeners are set up
  await tick();

  // Open the WS connection
  mockWs._simulateOpen();

  // Flush microtasks so register frame is sent and waitForRegisterAck is set up
  await tick();

  // Find the register frame and send ack
  const registerFrame = mockWs._sent.find((f) => f.kind === "node.register");
  if (registerFrame?.kind === "node.register") {
    mockWs._simulateMessage({
      kind: "node.register.ack",
      nodeId: registerFrame.nodeId,
      sessionId,
    });
  }

  await startPromise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplarNode", () => {
  describe("lifecycle", () => {
    it("should connect, register, and transition to connected state", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const connectedHandler = vi.fn();
      node.onConnected(connectedHandler);

      await startAndConnect(node, mockWs);

      expect(node.state).toBe("connected");
      expect(node.sessionId).toBe("session-1");
      expect(connectedHandler).toHaveBeenCalledWith("session-1");
    });

    it("should send node.register frame on connect", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await startAndConnect(node, mockWs);

      const registerFrame = mockWs._sent.find((f) => f.kind === "node.register");
      expect(registerFrame).toBeDefined();
      if (registerFrame?.kind === "node.register") {
        expect(registerFrame.nodeId).toBe("test-node-1");
        expect(registerFrame.capabilities.agentTypes).toEqual(["high"]);
        expect(registerFrame.token).toBe("test-token");
      }
    });

    it("should throw when starting an already-started node", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await startAndConnect(node, mockWs);

      await expect(node.start()).rejects.toThrow();
    });

    it("should stop gracefully: deregister, close, transition to disconnected", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await startAndConnect(node, mockWs);

      await node.stop();

      const deregisterFrame = mockWs._sent.find((f) => f.kind === "node.deregister");
      expect(deregisterFrame).toBeDefined();
      expect(node.state).toBe("disconnected");
    });

    it("should be a no-op when stopping an already-stopped node", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await expect(node.stop()).resolves.toBeUndefined();
    });
  });

  describe("frame dispatch", () => {
    it("should respond to heartbeat.ping before user handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const messageHandler = vi.fn();
      node.onMessage(messageHandler);

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({ kind: "heartbeat.ping", timestamp: 1000 });

      const pongFrame = mockWs._sent.find((f) => f.kind === "heartbeat.pong");
      expect(pongFrame).toBeDefined();
      if (pongFrame?.kind === "heartbeat.pong") {
        expect(pongFrame.timestamp).toBe(1000);
      }

      // Ping should NOT reach user handler
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it("should dispatch lane.message to onMessage handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const messageHandler = vi.fn();
      node.onMessage(messageHandler);

      await startAndConnect(node, mockWs);

      const laneMessage: LaneMessage = {
        id: "msg-1",
        lane: "steer",
        channelId: "channel-1",
        payload: { text: "hello" },
        timestamp: Date.now(),
      };
      mockWs._simulateMessage({
        kind: "lane.message",
        lane: "steer",
        message: laneMessage,
      });

      expect(messageHandler).toHaveBeenCalledOnce();
      expect(messageHandler).toHaveBeenCalledWith("steer", laneMessage);
    });

    it("should dispatch session.update to onSessionUpdate handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const sessionHandler = vi.fn();
      node.onSessionUpdate(sessionHandler);

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "session.update",
        sessionId: "session-1",
        nodeId: "test-node-1",
        state: "idle",
        timestamp: Date.now(),
      });

      expect(sessionHandler).toHaveBeenCalledWith("idle");
    });

    it("should dispatch config.changed to onConfigChanged handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const configHandler = vi.fn();
      node.onConfigChanged(configHandler);

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "config.changed",
        fields: ["sessionTimeout", "laneCapacity"],
        timestamp: Date.now(),
      });

      expect(configHandler).toHaveBeenCalledWith(["sessionTimeout", "laneCapacity"]);
    });

    it("should dispatch error frames to onError handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "error",
        error: {
          type: "about:blank",
          title: "Something failed",
          status: 500,
          detail: "Internal error",
        },
        timestamp: Date.now(),
      });

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err.message).toContain("Something failed");
    });

    it("should not crash on unhandled frame kinds", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await startAndConnect(node, mockWs);

      // lane.message.ack is valid but unhandled — should be ignored
      mockWs._simulateMessage({
        kind: "lane.message.ack",
        messageId: "msg-1",
      });

      expect(node.state).toBe("connected");
    });
  });

  describe("error boundary", () => {
    it("should catch synchronous handler throws and emit error", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onMessage(() => {
        throw new Error("Handler exploded");
      });

      await startAndConnect(node, mockWs);

      const laneMessage: LaneMessage = {
        id: "msg-1",
        lane: "steer",
        channelId: "channel-1",
        payload: {},
        timestamp: Date.now(),
      };
      mockWs._simulateMessage({
        kind: "lane.message",
        lane: "steer",
        message: laneMessage,
      });

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err.message).toBe("Handler exploded");
      expect(node.state).toBe("connected");
    });

    it("should catch async handler rejections and emit error", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onMessage(async () => {
        throw new Error("Async handler exploded");
      });

      await startAndConnect(node, mockWs);

      const laneMessage: LaneMessage = {
        id: "msg-1",
        lane: "collect",
        channelId: "channel-1",
        payload: {},
        timestamp: Date.now(),
      };
      mockWs._simulateMessage({
        kind: "lane.message",
        lane: "collect",
        message: laneMessage,
      });

      // Allow the rejected promise to propagate
      await tick();

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err.message).toBe("Async handler exploded");
    });
  });

  describe("reconnection", () => {
    it("should attempt reconnection on unexpected close", async () => {
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        return callCount === 1 ? mockWs1 : mockWs2;
      };

      const config = makeConfig({
        reconnect: { maxRetries: 3, baseDelay: 10, maxDelay: 50 },
      });
      const node = new TemplarNode(config, { wsFactory: multiFactory });

      const reconnectingHandler = vi.fn();
      const reconnectedHandler = vi.fn();
      node.onReconnecting(reconnectingHandler);
      node.onReconnected(reconnectedHandler);

      await startAndConnect(node, mockWs1);
      expect(node.state).toBe("connected");

      // Simulate unexpected close
      mockWs1._simulateClose(1006, "Abnormal closure");

      expect(node.state).toBe("reconnecting");
      expect(reconnectingHandler).toHaveBeenCalledOnce();

      // Wait for reconnect backoff + connection
      // Max delay is 50ms, tick() uses setTimeout(0) which fires after all timers <=0
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Flush microtasks for WS setup
      await tick();
      mockWs2._simulateOpen();
      await tick();

      // Send register ack for reconnected session
      const registerFrame = mockWs2._sent.find((f) => f.kind === "node.register");
      if (registerFrame?.kind === "node.register") {
        mockWs2._simulateMessage({
          kind: "node.register.ack",
          nodeId: registerFrame.nodeId,
          sessionId: "session-2",
        });
      }

      await tick();

      expect(reconnectedHandler).toHaveBeenCalledWith("session-2");
      expect(node.state).toBe("connected");
      expect(node.sessionId).toBe("session-2");
    });

    it("should NOT reconnect on auth-related close (code 1008)", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      const reconnectingHandler = vi.fn();
      node.onError(errorHandler);
      node.onReconnecting(reconnectingHandler);

      await startAndConnect(node, mockWs);

      mockWs._simulateClose(1008, "Policy violation");

      expect(reconnectingHandler).not.toHaveBeenCalled();
      expect(node.state).toBe("disconnected");
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    it("should resolve token factory on each reconnect attempt", async () => {
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        return callCount === 1 ? mockWs1 : mockWs2;
      };

      let tokenCallCount = 0;
      const tokenFactory = vi.fn(() => {
        tokenCallCount++;
        return `token-${tokenCallCount}`;
      });

      const config = makeConfig({
        token: tokenFactory,
        reconnect: { maxRetries: 3, baseDelay: 10, maxDelay: 50 },
      });
      const node = new TemplarNode(config, { wsFactory: multiFactory });

      await startAndConnect(node, mockWs1);
      expect(tokenFactory).toHaveBeenCalledTimes(1);

      // Disconnect
      mockWs1._simulateClose(1006, "Abnormal");

      // Wait for reconnect backoff
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tick();
      mockWs2._simulateOpen();
      await tick();

      const registerFrame = mockWs2._sent.find((f) => f.kind === "node.register");
      if (registerFrame?.kind === "node.register") {
        mockWs2._simulateMessage({
          kind: "node.register.ack",
          nodeId: registerFrame.nodeId,
          sessionId: "session-2",
        });
      }
      await tick();

      // Token factory should have been called again for reconnect
      expect(tokenFactory).toHaveBeenCalledTimes(2);
    });

    it("should cancel reconnection on stop()", async () => {
      vi.useFakeTimers();

      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const config = makeConfig({
        reconnect: { maxRetries: 10, baseDelay: 1_000, maxDelay: 30_000 },
      });
      const node = new TemplarNode(config, { wsFactory: factory });

      // Manually start since fake timers don't work with tick()
      const startPromise = node.start();
      await vi.advanceTimersByTimeAsync(0);
      mockWs._simulateOpen();
      await vi.advanceTimersByTimeAsync(0);
      const registerFrame = mockWs._sent.find((f) => f.kind === "node.register");
      if (registerFrame?.kind === "node.register") {
        mockWs._simulateMessage({
          kind: "node.register.ack",
          nodeId: registerFrame.nodeId,
          sessionId: "session-1",
        });
      }
      await startPromise;

      // Trigger reconnection
      mockWs._simulateClose(1006, "Abnormal");
      expect(node.state).toBe("reconnecting");

      // Stop should cancel reconnection
      await node.stop();
      expect(node.state).toBe("disconnected");

      // Advance timers — no reconnection should happen
      await vi.advanceTimersByTimeAsync(30_000);
      expect(node.state).toBe("disconnected");

      vi.useRealTimers();
    });
  });

  describe("config", () => {
    it("should expose resolved config with defaults", () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const resolved = node.config;
      expect(resolved.nodeId).toBe("test-node-1");
      expect(resolved.reconnect.maxRetries).toBe(10);
    });

    it("should throw ZodError for invalid config", () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      expect(
        () =>
          new TemplarNode(
            { nodeId: "", gatewayUrl: "not-url", token: "", capabilities: {} } as never,
            { wsFactory: factory },
          ),
      ).toThrow();
    });
  });
});
