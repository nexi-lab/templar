import { NodeHandlerError, NodeReconnectExhaustedError, NodeStartError } from "@templar/errors";
import type { LaneMessage } from "@templar/gateway/protocol";
import { describe, expect, it, vi } from "vitest";
import { TemplarNode } from "../node.js";
import type { WsClientFactory } from "../ws-client.js";
import { createMockWs, makeConfig, startAndConnect, tick } from "./helpers.js";

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

      await expect(node.start()).rejects.toThrow(NodeStartError);
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

    it("should support Symbol.asyncDispose", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      await startAndConnect(node, mockWs);
      expect(node.state).toBe("connected");

      await node[Symbol.asyncDispose]();
      expect(node.state).toBe("disconnected");
    });
  });

  describe("cancellation edge cases", () => {
    it("stop() during connecting state cancels start() cleanly", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const startPromise = node.start();
      await tick();

      // WS is connecting but not yet open — stop now
      const stopPromise = node.stop();
      expect(node.state).toBe("disconnected");

      // The start promise should reject because the signal was aborted
      await expect(startPromise).rejects.toThrow();
      await stopPromise;
    });

    it("stop() during registration ack wait aborts cleanly", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const startPromise = node.start();
      await tick();
      mockWs._simulateOpen();
      await tick();

      // WS is connected and register frame is sent, but no ack yet
      // Calling stop() will abort the signal that waitForRegisterAck listens on
      await node.stop();

      await expect(startPromise).rejects.toThrow();
      expect(node.state).toBe("disconnected");
    });

    it("stop() during reconnection prevents post-stop connection", async () => {
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        return callCount === 1 ? mockWs1 : mockWs2;
      };

      const config = makeConfig({
        reconnect: { maxRetries: 5, baseDelay: 10, maxDelay: 50 },
      });
      const node = new TemplarNode(config, { wsFactory: multiFactory });
      node.onError(() => {}); // suppress stderr

      await startAndConnect(node, mockWs1);

      // Trigger reconnection
      mockWs1._simulateClose(1006, "Abnormal closure");
      expect(node.state).toBe("reconnecting");

      // Stop during reconnection
      await node.stop();
      expect(node.state).toBe("disconnected");

      // Wait to ensure no reconnection happens
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(node.state).toBe("disconnected");
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
      expect(err).toBeInstanceOf(NodeHandlerError);
      expect(err.message).toContain("Handler exploded");
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
      expect(err).toBeInstanceOf(NodeHandlerError);
      expect(err.message).toContain("Async handler exploded");
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

    it("should emit NodeReconnectExhaustedError when retries are exhausted", async () => {
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        return callCount === 1 ? mockWs1 : mockWs2;
      };

      const config = makeConfig({
        reconnect: { maxRetries: 1, baseDelay: 10, maxDelay: 50 },
      });
      const node = new TemplarNode(config, { wsFactory: multiFactory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);

      await startAndConnect(node, mockWs1);

      // Trigger unexpected close
      mockWs1._simulateClose(1006, "Abnormal closure");
      expect(node.state).toBe("reconnecting");

      // Wait for the reconnect attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tick();

      // Fail the reconnect by simulating error
      mockWs2._simulateError(new Error("Connection refused"));
      await tick();

      // Wait for retry scheduling + exhaustion
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tick();

      // Should have exhausted retries
      const exhaustedError = errorHandler.mock.calls.find(
        (call) => call[0] instanceof NodeReconnectExhaustedError,
      );
      expect(exhaustedError).toBeDefined();
      expect(node.state).toBe("disconnected");
    });

    it("should emit error and schedule next retry on failed reconnect attempt", async () => {
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      const mockWs3 = createMockWs();
      let callCount = 0;
      const multiFactory: WsClientFactory = () => {
        callCount++;
        if (callCount === 1) return mockWs1;
        if (callCount === 2) return mockWs2;
        return mockWs3;
      };

      const config = makeConfig({
        reconnect: { maxRetries: 3, baseDelay: 10, maxDelay: 50 },
      });
      const node = new TemplarNode(config, { wsFactory: multiFactory });

      const errorHandler = vi.fn();
      const reconnectingHandler = vi.fn();
      node.onError(errorHandler);
      node.onReconnecting(reconnectingHandler);

      await startAndConnect(node, mockWs1);

      // Trigger unexpected close
      mockWs1._simulateClose(1006, "Abnormal closure");
      expect(node.state).toBe("reconnecting");

      // Wait for the first reconnect attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tick();

      // Fail the first reconnect attempt
      mockWs2._simulateError(new Error("Connection refused"));
      await tick();

      // Should have emitted reconnect-attempt error
      const reconnectError = errorHandler.mock.calls.find(
        (call) => call[1] === "reconnect-attempt",
      );
      expect(reconnectError).toBeDefined();

      // Should still be reconnecting (not exhausted, retries left)
      expect(node.state).toBe("reconnecting");

      // Should have scheduled another reconnecting event
      expect(reconnectingHandler.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await node.stop();
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

  describe("handler disposers", () => {
    it("should return a disposer that removes the handler", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const messageHandler = vi.fn();
      const dispose = node.onMessage(messageHandler);

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

      expect(messageHandler).toHaveBeenCalledOnce();

      // Dispose the handler
      dispose();

      // Send another message — handler should NOT be called again
      mockWs._simulateMessage({
        kind: "lane.message",
        lane: "steer",
        message: { ...laneMessage, id: "msg-2" },
      });

      expect(messageHandler).toHaveBeenCalledOnce(); // still 1
    });

    it("should support disposers on all on* methods", () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const disposers = [
        node.onConnected(() => {}),
        node.onDisconnected(() => {}),
        node.onReconnecting(() => {}),
        node.onReconnected(() => {}),
        node.onMessage(() => {}),
        node.onSessionUpdate(() => {}),
        node.onConfigChanged(() => {}),
        node.onError(() => {}),
      ];

      for (const dispose of disposers) {
        expect(typeof dispose).toBe("function");
      }
    });
  });

  describe("lane message ack", () => {
    it("should send lane.message.ack after sync handler completes", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      node.onMessage(() => {
        // sync handler
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

      const ackFrame = mockWs._sent.find((f) => f.kind === "lane.message.ack");
      expect(ackFrame).toBeDefined();
      if (ackFrame?.kind === "lane.message.ack") {
        expect(ackFrame.messageId).toBe("msg-1");
      }
    });

    it("should send lane.message.ack after async handlers resolve", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      node.onMessage(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await startAndConnect(node, mockWs);

      const laneMessage: LaneMessage = {
        id: "msg-2",
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

      // Wait for async handler + ack
      await tick();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const ackFrame = mockWs._sent.find(
        (f) => f.kind === "lane.message.ack" && f.messageId === "msg-2",
      );
      expect(ackFrame).toBeDefined();
    });

    it("should send lane.message.ack even if handler throws", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      node.onError(() => {}); // suppress error logging
      node.onMessage(() => {
        throw new Error("Handler exploded");
      });

      await startAndConnect(node, mockWs);

      const laneMessage: LaneMessage = {
        id: "msg-3",
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

      const ackFrame = mockWs._sent.find(
        (f) => f.kind === "lane.message.ack" && f.messageId === "msg-3",
      );
      expect(ackFrame).toBeDefined();
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

    it("should respect custom registrationTimeout", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig({ registrationTimeout: 50 }), { wsFactory: factory });

      const startPromise = node.start();
      await tick();
      mockWs._simulateOpen();
      await tick();

      // Don't send register ack — let it timeout
      await expect(startPromise).rejects.toThrow("registration timed out");
    });
  });

  describe("handler error wrapping", () => {
    it("should wrap non-Error throws from message handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onMessage(() => {
        throw "string error"; // non-Error throw
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
      expect(err).toBeInstanceOf(NodeHandlerError);
      expect(err.message).toContain("string error");
    });

    it("should wrap non-Error async rejections from message handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onMessage(async () => {
        throw 42; // non-Error rejection
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

      await tick();

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err).toBeInstanceOf(NodeHandlerError);
      expect(err.message).toContain("42");
    });

    it("should wrap errors from session update handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onSessionUpdate(() => {
        throw new Error("Session handler failed");
      });

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "session.update",
        sessionId: "session-1",
        nodeId: "test-node-1",
        state: "idle",
        timestamp: Date.now(),
      });

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err).toBeInstanceOf(NodeHandlerError);
    });

    it("should wrap errors from config changed handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onConfigChanged(() => {
        throw new Error("Config handler failed");
      });

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "config.changed",
        fields: ["timeout"],
        timestamp: Date.now(),
      });

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err).toBeInstanceOf(NodeHandlerError);
    });

    it("should wrap non-Error throws from session/config handlers", async () => {
      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      const errorHandler = vi.fn();
      node.onError(errorHandler);
      node.onSessionUpdate(() => {
        throw "non-error string";
      });

      await startAndConnect(node, mockWs);

      mockWs._simulateMessage({
        kind: "session.update",
        sessionId: "session-1",
        nodeId: "test-node-1",
        state: "idle",
        timestamp: Date.now(),
      });

      expect(errorHandler).toHaveBeenCalledOnce();
      const err = errorHandler.mock.calls[0]?.[0] as Error;
      expect(err).toBeInstanceOf(NodeHandlerError);
      expect(err.message).toContain("non-error string");
    });
  });

  describe("error emission", () => {
    it("should log to stderr when no error handler is registered", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const mockWs = createMockWs();
      const factory: WsClientFactory = vi.fn(() => mockWs);
      const node = new TemplarNode(makeConfig(), { wsFactory: factory });

      // No error handler registered
      await startAndConnect(node, mockWs);

      // Trigger an error frame
      mockWs._simulateMessage({
        kind: "error",
        error: { type: "about:blank", title: "Test error", status: 500, detail: "detail" },
        timestamp: Date.now(),
      });

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(consoleSpy.mock.calls[0]?.[0]).toContain("[TemplarNode]");

      consoleSpy.mockRestore();
    });
  });
});
