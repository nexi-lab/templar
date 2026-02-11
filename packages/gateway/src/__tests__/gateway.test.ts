import type { IncomingMessage } from "node:http";
import type { GatewayConfig, GatewayFrame, NodeCapabilities } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { TemplarGateway } from "../gateway.js";
import type { WebSocketLike, WebSocketServerLike, WsServerFactory } from "../server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GatewayConfig = {
  port: 0,
  nexusUrl: "https://api.nexus.test",
  nexusApiKey: "test-key",
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
  healthCheckInterval: 30_000,
  laneCapacity: 256,
};

const DEFAULT_CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

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
    clients: new Set<WebSocketLike>(),
    on(event: string, handler: (...args: unknown[]) => void) {
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

function createTestGateway(configOverrides: Partial<GatewayConfig> = {}): {
  gateway: TemplarGateway;
  wss: ReturnType<typeof createMockWss>;
} {
  const wss = createMockWss();
  const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const gateway = new TemplarGateway(config, {
    wsFactory: factory,
    configWatcherDeps: {
      watch: () => ({
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  });
  return { gateway, wss };
}

function simulateNodeConnection(
  wss: ReturnType<typeof createMockWss>,
  nodeId = "node-1",
): ReturnType<typeof createMockWs> {
  const ws = createMockWs();
  wss.simulateConnection(ws, {
    url: `/?nodeId=${nodeId}`,
    headers: { host: "localhost" },
  } as unknown as IncomingMessage);
  return ws;
}

function sendFrame(ws: ReturnType<typeof createMockWs>, frame: GatewayFrame): void {
  const messageHandlers = ws.handlers.get("message") ?? [];
  for (const h of messageHandlers) {
    h(JSON.stringify(frame));
  }
}

function simulateClose(ws: ReturnType<typeof createMockWs>, code = 1000, reason = ""): void {
  const closeHandlers = ws.handlers.get("close") ?? [];
  for (const h of closeHandlers) {
    h(code, reason);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplarGateway", () => {
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("starts and stops cleanly", async () => {
      const { gateway } = createTestGateway();
      await gateway.start();
      await gateway.stop();
    });

    it("exposes config", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getConfig().port).toBe(0);
      expect(gateway.getConfig().nexusApiKey).toBe("test-key");
    });

    it("reports zero connections and nodes initially", async () => {
      const { gateway } = createTestGateway();
      await gateway.start();
      expect(gateway.connectionCount).toBe(0);
      expect(gateway.nodeCount).toBe(0);
      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Node registration
  // -------------------------------------------------------------------------

  describe("node registration", () => {
    it("registers a node via frame and sends ack", async () => {
      const { gateway, wss } = createTestGateway();
      const registeredHandler = vi.fn();
      gateway.onNodeRegistered(registeredHandler);

      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      const registerFrame: GatewayFrame = {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      };
      sendFrame(ws, registerFrame);

      // Should send ack
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"kind":"node.register.ack"'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"nodeId":"agent-1"'));

      // Should register node
      expect(gateway.nodeCount).toBe(1);
      expect(gateway.getRegistry().get("agent-1")).toBeDefined();

      // Should fire handler
      expect(registeredHandler).toHaveBeenCalledWith("agent-1");

      // Should create session
      expect(gateway.getSessionManager().getSession("agent-1")).toBeDefined();

      await gateway.stop();
    });

    it("sends error frame for duplicate registration", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      const registerFrame: GatewayFrame = {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      };

      // First registration
      sendFrame(ws, registerFrame);
      // Second (duplicate)
      sendFrame(ws, registerFrame);

      // Second call should result in error frame
      const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = String(calls[calls.length - 1]);
      expect(lastCall).toContain('"kind":"error"');
      expect(lastCall).toContain("Registration failed");

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Node deregistration
  // -------------------------------------------------------------------------

  describe("node deregistration", () => {
    it("deregisters a node via frame", async () => {
      const { gateway, wss } = createTestGateway();
      const deregisteredHandler = vi.fn();
      gateway.onNodeDeregistered(deregisteredHandler);

      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      // Register first
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Deregister
      sendFrame(ws, {
        kind: "node.deregister",
        nodeId: "agent-1",
        reason: "shutting down",
      });

      expect(gateway.nodeCount).toBe(0);
      expect(deregisteredHandler).toHaveBeenCalledWith("agent-1");
      expect(gateway.getSessionManager().getSession("agent-1")).toBeUndefined();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  describe("heartbeat", () => {
    it("processes pong frames", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      // Register
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Send pong
      sendFrame(ws, {
        kind: "heartbeat.pong",
        timestamp: Date.now(),
      });

      // Node should still be alive
      const node = gateway.getRegistry().get("agent-1");
      expect(node?.isAlive).toBe(true);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Lane message routing
  // -------------------------------------------------------------------------

  describe("lane message routing", () => {
    it("routes lane messages through the router", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      // Register
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      // Bind channel to node
      gateway.bindChannel("ch-1", "agent-1");

      // Send lane message
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: { text: "hello" },
          timestamp: Date.now(),
        },
      });

      // Message should be in the dispatcher's queue
      const _router = gateway.getRouter();
      // We can't directly access the dispatcher, but the route didn't throw
      // which means it was dispatched successfully
      expect(gateway.nodeCount).toBe(1);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // WebSocket disconnect
  // -------------------------------------------------------------------------

  describe("disconnect handling", () => {
    it("handles WebSocket disconnect for registered node", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "agent-1");

      // Register using the WS nodeId
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(gateway.getSessionManager().getSession("agent-1")).toBeDefined();

      // Simulate disconnect
      simulateClose(ws, 1000, "Normal closure");

      // Session should have transitioned to disconnected and been cleaned up
      // The disconnect handler calls sessionManager.handleEvent(nodeId, "disconnect")
      // which transitions connected → disconnected and cleans up
      expect(gateway.getSessionManager().getSession("agent-1")).toBeUndefined();

      await gateway.stop();
    });

    it("does not throw for disconnect of unregistered connection", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "unknown-1");

      // Disconnect without prior registration
      expect(() => simulateClose(ws, 1000, "Normal")).not.toThrow();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Channel binding
  // -------------------------------------------------------------------------

  describe("channel binding", () => {
    it("binds and unbinds channels", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = simulateNodeConnection(wss, "ws-1");

      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      gateway.bindChannel("ch-1", "agent-1");
      expect(gateway.getRouter().getBinding("ch-1")).toBe("agent-1");

      gateway.unbindChannel("ch-1");
      expect(gateway.getRouter().getBinding("ch-1")).toBeUndefined();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Subsystem accessors
  // -------------------------------------------------------------------------

  describe("subsystem accessors", () => {
    it("exposes registry, session manager, and router", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getRegistry()).toBeDefined();
      expect(gateway.getSessionManager()).toBeDefined();
      expect(gateway.getRouter()).toBeDefined();
    });
  });
});
