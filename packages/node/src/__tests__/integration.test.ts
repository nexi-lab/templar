/**
 * Integration tests for @templar/node.
 *
 * Uses a real ws.WebSocketServer to test the TemplarNode's actual
 * WebSocket behavior: connection, auth, registration, heartbeat,
 * lane message delivery, and graceful shutdown.
 */

import { type AddressInfo, createServer } from "node:net";
import type { GatewayFrame, LaneMessage, NodeRegisterFrame } from "@templar/gateway-protocol";
import { safeParseFrame } from "@templar/gateway-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { TemplarNode } from "../node.js";
import type { NodeConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find an available port */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address() as AddressInfo;
      server.close((err) => {
        if (err) reject(err);
        else resolve(addr.port);
      });
    });
  });
}

/** Wait for a condition to become true, polling every `interval` ms */
async function waitFor(condition: () => boolean, timeout = 5_000, interval = 10): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ---------------------------------------------------------------------------
// Mini Gateway Server
// ---------------------------------------------------------------------------

interface MiniGateway {
  readonly port: number;
  readonly wss: WebSocketServer;
  readonly connections: Map<string, WebSocket>;
  readonly receivedFrames: GatewayFrame[];
  sendToNode: (nodeId: string, frame: GatewayFrame) => void;
  closeConnection: (nodeId: string, code?: number, reason?: string) => void;
  stop: () => Promise<void>;
}

/**
 * Create a minimal WS server that speaks the GatewayFrame protocol.
 * Handles registration, heartbeat, and forwards lane messages.
 */
async function createMiniGateway(
  opts: { token?: string; autoRegisterAck?: boolean } = {},
): Promise<MiniGateway> {
  const { token = "test-token", autoRegisterAck = true } = opts;
  const port = await findFreePort();

  const connections = new Map<string, WebSocket>();
  const receivedFrames: GatewayFrame[] = [];

  const wss = new WebSocketServer({
    port,
    verifyClient: (info, cb) => {
      const authHeader = info.req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        cb(false, 401, "Unauthorized");
        return;
      }
      const providedToken = authHeader.slice(7);
      cb(providedToken === token, providedToken === token ? undefined : 403);
    },
  });

  await new Promise<void>((resolve) => wss.on("listening", resolve));

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const nodeId = url.searchParams.get("nodeId") ?? `unknown-${Date.now()}`;
    connections.set(nodeId, ws);

    ws.on("message", (data) => {
      const result = safeParseFrame(JSON.parse(data.toString()));
      if (!result.success) return;

      const frame = result.data as GatewayFrame;
      receivedFrames.push(frame);

      // Auto-respond to registration
      if (frame.kind === "node.register" && autoRegisterAck) {
        const registerFrame = frame as NodeRegisterFrame;
        const ack: GatewayFrame = {
          kind: "node.register.ack",
          nodeId: registerFrame.nodeId,
          sessionId: `session-${Date.now()}`,
        };
        ws.send(JSON.stringify(ack));
      }
    });

    ws.on("close", () => {
      connections.delete(nodeId);
    });
  });

  return {
    port,
    wss,
    connections,
    receivedFrames,
    sendToNode(nodeId: string, frame: GatewayFrame) {
      const ws = connections.get(nodeId);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(frame));
      }
    },
    closeConnection(nodeId: string, code?: number, reason?: string) {
      const ws = connections.get(nodeId);
      if (ws) {
        if (code === undefined) {
          // Simulate abnormal closure by terminating the socket
          ws.terminate();
        } else {
          ws.close(code, reason);
        }
      }
    },
    async stop() {
      for (const ws of connections.values()) {
        ws.close(1001, "Server stopping");
      }
      connections.clear();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

function makeNodeConfig(port: number, overrides?: Partial<NodeConfig>): NodeConfig {
  return {
    nodeId: "test-node-1",
    gatewayUrl: `ws://127.0.0.1:${port}`,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplarNode integration", () => {
  let gateway: MiniGateway;
  const nodes: TemplarNode[] = [];

  beforeEach(async () => {
    gateway = await createMiniGateway();
    nodes.length = 0;
  });

  afterEach(async () => {
    // Stop all nodes BEFORE gateway to prevent post-shutdown reconnection noise
    for (const node of nodes) {
      await node.stop();
    }
    await gateway.stop();
  });

  it("scenario 1: full lifecycle — connect, register, disconnect", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    const connectedHandler = vi.fn();
    const disconnectedHandler = vi.fn();
    node.onConnected(connectedHandler);
    node.onDisconnected(disconnectedHandler);

    // Start node — real WS connection
    await node.start();

    expect(node.state).toBe("connected");
    expect(node.sessionId).toBeDefined();
    expect(connectedHandler).toHaveBeenCalledOnce();

    // Verify server received register frame
    const registerFrame = gateway.receivedFrames.find((f) => f.kind === "node.register");
    expect(registerFrame).toBeDefined();
    if (registerFrame?.kind === "node.register") {
      expect(registerFrame.nodeId).toBe("test-node-1");
      expect(registerFrame.capabilities.agentTypes).toEqual(["high"]);
    }

    // Verify connection exists on server
    expect(gateway.connections.has("test-node-1")).toBe(true);

    // Stop node
    await node.stop();

    expect(node.state).toBe("disconnected");

    // Wait for server to process deregister
    await waitFor(() => gateway.receivedFrames.some((f) => f.kind === "node.deregister"));

    const deregisterFrame = gateway.receivedFrames.find((f) => f.kind === "node.deregister");
    expect(deregisterFrame).toBeDefined();
  });

  it("scenario 2: lane message delivery", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    const messageHandler = vi.fn();
    node.onMessage(messageHandler);

    await node.start();

    // Send a lane message from the gateway to the node
    const laneMessage: LaneMessage = {
      id: "msg-1",
      lane: "steer",
      channelId: "channel-1",
      payload: { instruction: "search for foo" },
      timestamp: Date.now(),
    };
    gateway.sendToNode("test-node-1", {
      kind: "lane.message",
      lane: "steer",
      message: laneMessage,
    });

    // Wait for handler to be called
    await waitFor(() => messageHandler.mock.calls.length > 0);

    expect(messageHandler).toHaveBeenCalledWith("steer", laneMessage);
  });

  it("scenario 3: heartbeat exchange", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    await node.start();

    // Send a heartbeat ping from the gateway
    gateway.sendToNode("test-node-1", {
      kind: "heartbeat.ping",
      timestamp: Date.now(),
    });

    // Wait for pong response
    await waitFor(() => gateway.receivedFrames.some((f) => f.kind === "heartbeat.pong"));

    const pongFrame = gateway.receivedFrames.find((f) => f.kind === "heartbeat.pong");
    expect(pongFrame).toBeDefined();
    expect(pongFrame?.kind).toBe("heartbeat.pong");
  });

  it("scenario 4: auth failure — wrong token", async () => {
    const config = makeNodeConfig(gateway.port, { token: "wrong-token" });
    const node = new TemplarNode(config);
    nodes.push(node);

    const errorHandler = vi.fn();
    node.onError(errorHandler);

    // start() should reject because WS connection fails auth
    await expect(node.start()).rejects.toThrow();

    expect(node.state).toBe("disconnected");
  });

  it("scenario 5: graceful shutdown sends deregister", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    await node.start();
    expect(node.state).toBe("connected");

    // Record frame count before stop
    const frameCountBefore = gateway.receivedFrames.length;

    await node.stop();

    // Wait for server to receive deregister
    await waitFor(() => gateway.receivedFrames.length > frameCountBefore);

    const deregisterFrame = gateway.receivedFrames.find((f) => f.kind === "node.deregister");
    expect(deregisterFrame).toBeDefined();
    if (deregisterFrame?.kind === "node.deregister") {
      expect(deregisterFrame.nodeId).toBe("test-node-1");
    }

    // Server should see the connection as closed
    await waitFor(() => !gateway.connections.has("test-node-1"));
  });

  it("scenario 6: reconnection after server-side disconnect", { timeout: 15_000 }, async () => {
    const config = makeNodeConfig(gateway.port, {
      reconnect: { maxRetries: 5, baseDelay: 50, maxDelay: 200 },
    });
    const node = new TemplarNode(config);
    nodes.push(node);

    const reconnectingHandler = vi.fn();
    const reconnectedHandler = vi.fn();
    node.onReconnecting(reconnectingHandler);
    node.onReconnected(reconnectedHandler);

    await node.start();
    const firstSessionId = node.sessionId;
    expect(node.state).toBe("connected");

    // Server forcefully terminates the connection (no close frame = abnormal)
    gateway.closeConnection("test-node-1");

    // Wait for disconnect to propagate, then for reconnection to complete
    // Use extended timeout — reconnection involves backoff + WS handshake + registration
    await waitFor(() => node.state !== "connected", 10_000);
    await waitFor(() => node.state === "connected", 10_000);

    expect(reconnectingHandler).toHaveBeenCalled();
    expect(reconnectedHandler).toHaveBeenCalledOnce();
    expect(node.sessionId).toBeDefined();
    expect(node.sessionId).not.toBe(firstSessionId);
  });

  it("scenario 7: session update notification", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    // Suppress reconnection error noise during cleanup
    node.onError(() => {});

    const sessionUpdateHandler = vi.fn();
    node.onSessionUpdate(sessionUpdateHandler);

    await node.start();

    // Gateway sends session update
    gateway.sendToNode("test-node-1", {
      kind: "session.update",
      sessionId: node.sessionId ?? "",
      nodeId: "test-node-1",
      state: "idle",
      timestamp: Date.now(),
    });

    await waitFor(() => sessionUpdateHandler.mock.calls.length > 0);

    expect(sessionUpdateHandler).toHaveBeenCalledWith("idle");
  });

  it("scenario 8: config change notification", async () => {
    const config = makeNodeConfig(gateway.port);
    const node = new TemplarNode(config);
    nodes.push(node);

    const configChangedHandler = vi.fn();
    node.onConfigChanged(configChangedHandler);

    await node.start();

    // Gateway sends config change
    gateway.sendToNode("test-node-1", {
      kind: "config.changed",
      fields: ["sessionTimeout"],
      timestamp: Date.now(),
    });

    await waitFor(() => configChangedHandler.mock.calls.length > 0);

    expect(configChangedHandler).toHaveBeenCalledWith(["sessionTimeout"]);
  });
});
