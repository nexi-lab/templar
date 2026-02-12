import type { GatewayFrame } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { closeWs, createTestGateway, DEFAULT_CAPS, sendFrame } from "./helpers.js";

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
      const ws = wss.connect("ws-1");

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
      const ws = wss.connect("ws-1");

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
      const ws = wss.connect("ws-1");

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
      const ws = wss.connect("ws-1");

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
    it("routes lane messages and sends ack", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("ws-1");

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

      // Should have sent lane.message.ack
      const ackFrame = ws.sentFrames().find((f) => f.kind === "lane.message.ack");
      expect(ackFrame).toBeDefined();
      expect(ackFrame?.kind === "lane.message.ack" && ackFrame.messageId).toBe("msg-1");

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
      const ws = wss.connect("agent-1");

      // Register using the WS nodeId
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "agent-1",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(gateway.getSessionManager().getSession("agent-1")).toBeDefined();

      // Simulate disconnect
      closeWs(ws, 1000, "Normal closure");

      // Session should have transitioned to disconnected and been cleaned up
      expect(gateway.getSessionManager().getSession("agent-1")).toBeUndefined();

      await gateway.stop();
    });

    it("does not throw for disconnect of unregistered connection", async () => {
      const { gateway, wss } = createTestGateway();
      await gateway.start();
      const ws = wss.connect("unknown-1");

      // Disconnect without prior registration
      expect(() => closeWs(ws, 1000, "Normal")).not.toThrow();

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
      const ws = wss.connect("ws-1");

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
    it("exposes registry, session manager, router, and delivery tracker", () => {
      const { gateway } = createTestGateway();
      expect(gateway.getRegistry()).toBeDefined();
      expect(gateway.getSessionManager()).toBeDefined();
      expect(gateway.getRouter()).toBeDefined();
      expect(gateway.getDeliveryTracker()).toBeDefined();
    });
  });
});
