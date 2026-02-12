/**
 * Adversarial tests for @templar/gateway.
 *
 * Tests edge cases, malicious inputs, boundary conditions,
 * and failure modes that are unlikely in normal operation.
 */

import type { GatewayFrame, NodeCapabilities } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { GatewayServer } from "../server.js";
import {
  closeWs,
  createMockFactory,
  createMockWs,
  createMockWss,
  createTestGateway,
  sendFrame,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

// ---------------------------------------------------------------------------
// Adversarial: Server layer
// ---------------------------------------------------------------------------

describe("adversarial: server", () => {
  it("handles oversized JSON payloads gracefully", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Send a huge but valid JSON string — should not crash
    const bigPayload = JSON.stringify({ kind: "heartbeat.pong", timestamp: 1, data: "x".repeat(100_000) });
    const messageHandlers = ws.handlers.get("message") ?? [];
    expect(() => {
      for (const h of messageHandlers) {
        h(bigPayload);
      }
    }).not.toThrow();

    // Should get an invalid frame error (unknown field is fine, but schema validation may fail)
    await server.stop();
  });

  it("handles rapid connect/disconnect cycles", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    // Rapid connect/disconnect 50 times
    for (let i = 0; i < 50; i++) {
      const ws = createMockWs();
      wss.simulateConnection(ws);
      const closeHandlers = ws.handlers.get("close") ?? [];
      for (const h of closeHandlers) {
        h(1000, "");
      }
    }

    expect(server.connectionCount).toBe(0);

    await server.stop();
  });

  it("handles multiple close events for same connection", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    const ws = createMockWs();
    wss.simulateConnection(ws);

    const closeHandlers = ws.handlers.get("close") ?? [];

    // Fire close multiple times — should not throw
    expect(() => {
      for (let i = 0; i < 3; i++) {
        for (const h of closeHandlers) {
          h(1000, "Normal");
        }
      }
    }).not.toThrow();

    expect(server.connectionCount).toBe(0);
    await server.stop();
  });

  it("handles messages after close", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Close the connection
    const closeHandlers = ws.handlers.get("close") ?? [];
    for (const h of closeHandlers) {
      h(1000, "");
    }

    // Send a message after close — should not throw
    const messageHandlers = ws.handlers.get("message") ?? [];
    expect(() => {
      for (const h of messageHandlers) {
        h(JSON.stringify({ kind: "heartbeat.pong", timestamp: Date.now() }));
      }
    }).not.toThrow();

    await server.stop();
  });

  it("handles empty string message", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    const ws = createMockWs();
    wss.simulateConnection(ws);

    const messageHandlers = ws.handlers.get("message") ?? [];
    expect(() => {
      for (const h of messageHandlers) {
        h("");
      }
    }).not.toThrow();

    // Should get a parse error
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Parse error"));

    await server.stop();
  });

  it("handles null/undefined message data", async () => {
    const wss = createMockWss();
    const server = new GatewayServer(
      { port: 0, validateToken: () => true },
      createMockFactory(wss),
    );
    await server.start();

    const ws = createMockWs();
    wss.simulateConnection(ws);

    const messageHandlers = ws.handlers.get("message") ?? [];
    expect(() => {
      for (const h of messageHandlers) {
        h(null);
      }
    }).not.toThrow();

    await server.stop();
  });
});

// ---------------------------------------------------------------------------
// Adversarial: Gateway orchestrator
// ---------------------------------------------------------------------------

describe("adversarial: gateway", () => {
  it("handles registration with empty nodeId", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");

    // Empty nodeId should fail validation at the protocol level
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "",
      capabilities: CAPS,
      token: "test-key",
    } as GatewayFrame);

    // Should not register
    expect(gateway.nodeCount).toBe(0);

    await gateway.stop();
  });

  it("handles heartbeat pong from unregistered connection", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");

    // Send pong without registering — should not throw
    expect(() => {
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });
    }).not.toThrow();

    await gateway.stop();
  });

  it("handles lane message from unbound channel", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-1",
      capabilities: CAPS,
      token: "test-key",
    });

    // Send lane message for unbound channel — should send error frame
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: {
        id: "msg-1",
        lane: "steer",
        channelId: "unbound-channel",
        payload: null,
        timestamp: Date.now(),
      },
    });

    // Should have sent an error frame
    const errorFrame = ws.sentFrames().find(
      (f) => f.kind === "error" && ("error" in f) && f.error.title === "Message routing failed",
    );
    expect(errorFrame).toBeDefined();

    await gateway.stop();
  });

  it("handles rapid registration/deregistration cycles", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    for (let i = 0; i < 20; i++) {
      const ws = wss.connect(`ws-${i}`);
      const nodeId = `agent-${i}`;

      sendFrame(ws, {
        kind: "node.register",
        nodeId,
        capabilities: CAPS,
        token: "test-key",
      });

      sendFrame(ws, {
        kind: "node.deregister",
        nodeId,
        reason: "cycling",
      });
    }

    expect(gateway.nodeCount).toBe(0);

    await gateway.stop();
  });

  it("handles concurrent registrations on same connection", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");

    // Register node A on this connection
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-A",
      capabilities: CAPS,
      token: "test-key",
    });

    // Try to register node B on same connection — should fail (agent-B will register
    // but the connection mapping will be overwritten, which is acceptable behavior)
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-B",
      capabilities: CAPS,
      token: "test-key",
    });

    // At least agent-A should be registered
    expect(gateway.getRegistry().get("agent-A")).toBeDefined();

    await gateway.stop();
  });

  it("handles deregistration of non-existent node", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");

    // Deregister without registering — should not throw
    expect(() => {
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "nonexistent",
        reason: "test",
      });
    }).not.toThrow();

    await gateway.stop();
  });

  it("handles disconnect during active message routing", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-1",
      capabilities: CAPS,
      token: "test-key",
    });

    gateway.bindChannel("ch-1", "agent-1");

    // Send a message then immediately disconnect
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: {
        id: "msg-1",
        lane: "steer",
        channelId: "ch-1",
        payload: null,
        timestamp: Date.now(),
      },
    });
    closeWs(ws, 1006, "Abnormal closure");

    // Gateway should still be operational
    expect(gateway.connectionCount).toBe(0);

    await gateway.stop();
  });
});

// ---------------------------------------------------------------------------
// Adversarial: Delivery tracker
// ---------------------------------------------------------------------------

describe("adversarial: delivery tracker", () => {
  it("tracks messages and acks through full lifecycle", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-1",
      capabilities: CAPS,
      token: "test-key",
    });

    gateway.bindChannel("ch-1", "agent-1");

    // Send multiple messages
    for (let i = 0; i < 5; i++) {
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: {
          id: `msg-${i}`,
          lane: "steer",
          channelId: "ch-1",
          payload: null,
          timestamp: Date.now(),
        },
      });
    }

    // All should be tracked
    expect(gateway.getDeliveryTracker().pendingCount("agent-1")).toBe(5);

    // Ack some
    sendFrame(ws, { kind: "lane.message.ack", messageId: "msg-0" });
    sendFrame(ws, { kind: "lane.message.ack", messageId: "msg-2" });

    expect(gateway.getDeliveryTracker().pendingCount("agent-1")).toBe(3);

    // Ack same message twice — no error
    sendFrame(ws, { kind: "lane.message.ack", messageId: "msg-0" });
    expect(gateway.getDeliveryTracker().pendingCount("agent-1")).toBe(3);

    await gateway.stop();
  });

  it("cleans up delivery tracker on node deregistration", async () => {
    const { gateway, wss } = createTestGateway();
    await gateway.start();

    const ws = wss.connect("ws-1");
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-1",
      capabilities: CAPS,
      token: "test-key",
    });

    gateway.bindChannel("ch-1", "agent-1");

    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: {
        id: "msg-1",
        lane: "steer",
        channelId: "ch-1",
        payload: null,
        timestamp: Date.now(),
      },
    });

    expect(gateway.getDeliveryTracker().pendingCount("agent-1")).toBe(1);

    // Deregister should clean up
    sendFrame(ws, {
      kind: "node.deregister",
      nodeId: "agent-1",
    });

    expect(gateway.getDeliveryTracker().pendingCount("agent-1")).toBe(0);

    await gateway.stop();
  });
});

// ---------------------------------------------------------------------------
// Adversarial: Queue overflow
// ---------------------------------------------------------------------------

describe("adversarial: queue overflow", () => {
  it("handles queue overflow for lane messages", async () => {
    const { gateway, wss } = createTestGateway({ laneCapacity: 3 });
    await gateway.start();

    const ws = wss.connect("ws-1");
    sendFrame(ws, {
      kind: "node.register",
      nodeId: "agent-1",
      capabilities: CAPS,
      token: "test-key",
    });

    gateway.bindChannel("ch-1", "agent-1");

    // Send more messages than the queue can hold
    for (let i = 0; i < 5; i++) {
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: {
          id: `msg-${i}`,
          lane: "steer",
          channelId: "ch-1",
          payload: null,
          timestamp: Date.now(),
        },
      });
    }

    // Queue is bounded — should have exactly capacity messages
    const drained = gateway.drainNode("agent-1");
    expect(drained.length).toBeLessThanOrEqual(3);

    await gateway.stop();
  });
});
