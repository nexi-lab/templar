import type { GatewayFrame, HeartbeatPongFrame } from "@templar/gateway-protocol";
import { describe, expect, it, vi } from "vitest";
import { HeartbeatResponder } from "../heartbeat-responder.js";

describe("HeartbeatResponder", () => {
  it("should respond to heartbeat.ping with matching pong", () => {
    const sendPong = vi.fn();
    const responder = new HeartbeatResponder(sendPong);

    const pingFrame: GatewayFrame = {
      kind: "heartbeat.ping",
      timestamp: 1234567890,
    };

    const handled = responder.handleFrame(pingFrame);

    expect(handled).toBe(true);
    expect(sendPong).toHaveBeenCalledOnce();

    const pong = sendPong.mock.calls[0]?.[0] as HeartbeatPongFrame;
    expect(pong.kind).toBe("heartbeat.pong");
    expect(pong.timestamp).toBe(1234567890);
  });

  it("should return false for non-ping frames", () => {
    const sendPong = vi.fn();
    const responder = new HeartbeatResponder(sendPong);

    const ackFrame: GatewayFrame = {
      kind: "node.register.ack",
      nodeId: "test",
      sessionId: "session-1",
    };

    const handled = responder.handleFrame(ackFrame);

    expect(handled).toBe(false);
    expect(sendPong).not.toHaveBeenCalled();
  });

  it("should track lastPingAt after handling a ping", () => {
    const sendPong = vi.fn();
    const responder = new HeartbeatResponder(sendPong);

    expect(responder.lastPingAt).toBeUndefined();

    const pingFrame: GatewayFrame = {
      kind: "heartbeat.ping",
      timestamp: 1000,
    };
    responder.handleFrame(pingFrame);

    expect(responder.lastPingAt).toBe(1000);
  });

  it("should update lastPingAt on subsequent pings", () => {
    const sendPong = vi.fn();
    const responder = new HeartbeatResponder(sendPong);

    responder.handleFrame({ kind: "heartbeat.ping", timestamp: 1000 });
    expect(responder.lastPingAt).toBe(1000);

    responder.handleFrame({ kind: "heartbeat.ping", timestamp: 2000 });
    expect(responder.lastPingAt).toBe(2000);
  });
});
