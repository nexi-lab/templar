import { describe, expect, it } from "vitest";
import { type GatewayFrame, GatewayFrameSchema, parseFrame, safeParseFrame } from "../frames.js";

describe("GatewayFrame schemas", () => {
  // -------------------------------------------------------------------------
  // node.register
  // -------------------------------------------------------------------------
  describe("node.register", () => {
    const validFrame: GatewayFrame = {
      kind: "node.register",
      nodeId: "node-1",
      capabilities: {
        agentTypes: ["high"],
        tools: ["web-search"],
        maxConcurrency: 4,
        channels: ["slack"],
      },
      token: "bearer-token-123",
    };

    it("accepts a valid node.register frame", () => {
      expect(parseFrame(validFrame)).toEqual(validFrame);
    });

    it("rejects node.register with empty nodeId", () => {
      const result = safeParseFrame({ ...validFrame, nodeId: "" });
      expect(result.success).toBe(false);
    });

    it("rejects node.register with empty agentTypes", () => {
      const result = safeParseFrame({
        ...validFrame,
        capabilities: { ...validFrame.capabilities, agentTypes: [] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects node.register with missing token", () => {
      const { token: _, ...noToken } = validFrame;
      const result = safeParseFrame(noToken);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // node.register.ack
  // -------------------------------------------------------------------------
  describe("node.register.ack", () => {
    it("accepts a valid ack frame", () => {
      const frame: GatewayFrame = {
        kind: "node.register.ack",
        nodeId: "node-1",
        sessionId: "session-abc",
      };
      expect(parseFrame(frame)).toEqual(frame);
    });
  });

  // -------------------------------------------------------------------------
  // node.deregister
  // -------------------------------------------------------------------------
  describe("node.deregister", () => {
    it("accepts without reason", () => {
      const frame: GatewayFrame = { kind: "node.deregister", nodeId: "node-1" };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts with reason", () => {
      const frame: GatewayFrame = {
        kind: "node.deregister",
        nodeId: "node-1",
        reason: "shutting down",
      };
      expect(parseFrame(frame)).toEqual(frame);
    });
  });

  // -------------------------------------------------------------------------
  // heartbeat.ping / heartbeat.pong
  // -------------------------------------------------------------------------
  describe("heartbeat", () => {
    it("accepts valid ping", () => {
      const frame: GatewayFrame = { kind: "heartbeat.ping", timestamp: Date.now() };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts valid pong", () => {
      const frame: GatewayFrame = { kind: "heartbeat.pong", timestamp: Date.now() };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects ping with non-positive timestamp", () => {
      const result = safeParseFrame({ kind: "heartbeat.ping", timestamp: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects ping with fractional timestamp", () => {
      const result = safeParseFrame({ kind: "heartbeat.ping", timestamp: 1.5 });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // lane.message
  // -------------------------------------------------------------------------
  describe("lane.message", () => {
    it("accepts a valid lane message frame", () => {
      const frame: GatewayFrame = {
        kind: "lane.message",
        lane: "steer",
        message: {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: { text: "hello" },
          timestamp: Date.now(),
        },
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts interrupt lane", () => {
      const frame: GatewayFrame = {
        kind: "lane.message",
        lane: "interrupt",
        message: {
          id: "msg-2",
          lane: "interrupt",
          channelId: "ch-1",
          payload: null,
          timestamp: Date.now(),
        },
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects invalid lane value", () => {
      const result = safeParseFrame({
        kind: "lane.message",
        lane: "invalid-lane",
        message: {
          id: "msg-1",
          lane: "steer",
          channelId: "ch-1",
          payload: null,
          timestamp: Date.now(),
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // lane.message.ack
  // -------------------------------------------------------------------------
  describe("lane.message.ack", () => {
    it("accepts a valid ack", () => {
      const frame: GatewayFrame = { kind: "lane.message.ack", messageId: "msg-1" };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects empty messageId", () => {
      const result = safeParseFrame({ kind: "lane.message.ack", messageId: "" });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // session.update
  // -------------------------------------------------------------------------
  describe("session.update", () => {
    it("accepts a valid session update", () => {
      const frame: GatewayFrame = {
        kind: "session.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        state: "idle",
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects invalid session state", () => {
      const result = safeParseFrame({
        kind: "session.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        state: "unknown",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // config.changed
  // -------------------------------------------------------------------------
  describe("config.changed", () => {
    it("accepts valid config changed", () => {
      const frame: GatewayFrame = {
        kind: "config.changed",
        fields: ["sessionTimeout"],
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects empty fields array", () => {
      const result = safeParseFrame({
        kind: "config.changed",
        fields: [],
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // error
  // -------------------------------------------------------------------------
  describe("error", () => {
    it("accepts a valid error frame", () => {
      const frame: GatewayFrame = {
        kind: "error",
        requestId: "req-1",
        error: {
          type: "about:blank",
          title: "Node not found",
          status: 404,
          detail: "Node 'node-99' does not exist",
        },
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts error frame without requestId", () => {
      const frame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Internal error",
          status: 500,
        },
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid frames
  // -------------------------------------------------------------------------
  describe("invalid frames", () => {
    it("rejects unknown kind", () => {
      const result = safeParseFrame({ kind: "unknown.frame" });
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = safeParseFrame(null);
      expect(result.success).toBe(false);
    });

    it("rejects string", () => {
      const result = safeParseFrame("not a frame");
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = safeParseFrame({});
      expect(result.success).toBe(false);
    });
  });
});

describe("GatewayFrameSchema discriminated union", () => {
  it("discriminates on kind field", () => {
    const result = GatewayFrameSchema.safeParse({
      kind: "heartbeat.ping",
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("heartbeat.ping");
    }
  });
});
