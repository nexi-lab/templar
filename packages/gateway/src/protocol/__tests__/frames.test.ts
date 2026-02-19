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

    it("accepts node.register without token when signature is absent (validation in handler)", () => {
      const { token: _, ...noToken } = validFrame;
      // Schema allows optional token/signature; auth validation happens in frame handler
      const result = safeParseFrame(noToken);
      expect(result.success).toBe(true);
    });

    it("accepts node.register with signature instead of token", () => {
      const frame = {
        kind: "node.register" as const,
        nodeId: "node-1",
        capabilities: validFrame.capabilities,
        signature: "eyJhbGciOiJFZERTQSJ9.test.signature",
        publicKey: "dGVzdC1wdWJsaWMta2V5",
      };
      const result = safeParseFrame(frame);
      expect(result.success).toBe(true);
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
  // session.identity.update
  // -------------------------------------------------------------------------
  describe("session.identity.update", () => {
    it("accepts a valid session identity update", () => {
      const frame: GatewayFrame = {
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { name: "Bot", avatar: "https://a.png" },
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts identity with all fields", () => {
      const frame: GatewayFrame = {
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: {
          name: "Full Bot",
          avatar: "https://avatar.png",
          bio: "A helpful bot",
          systemPromptPrefix: "You are helpful.",
        },
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("accepts identity with minimal fields (empty object)", () => {
      const frame: GatewayFrame = {
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: {},
        timestamp: Date.now(),
      };
      expect(parseFrame(frame)).toEqual(frame);
    });

    it("rejects missing identity field", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty sessionId", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "",
        nodeId: "node-1",
        identity: { name: "Bot" },
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty nodeId", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "",
        identity: { name: "Bot" },
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-positive timestamp", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { name: "Bot" },
        timestamp: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects name exceeding 80 characters", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { name: "x".repeat(81) },
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid avatar URL", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { avatar: "not-a-url" },
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects bio exceeding 512 characters", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { bio: "x".repeat(513) },
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects systemPromptPrefix exceeding 4096 characters", () => {
      const result = safeParseFrame({
        kind: "session.identity.update",
        sessionId: "sess-1",
        nodeId: "node-1",
        identity: { systemPromptPrefix: "x".repeat(4097) },
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
