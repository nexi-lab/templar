import type { GatewayFrame, HeartbeatPongFrame } from "@templar/gateway/protocol";

// ---------------------------------------------------------------------------
// HeartbeatResponder
// ---------------------------------------------------------------------------

/**
 * Auto-responds to heartbeat.ping frames at the protocol level.
 *
 * This should be wired BEFORE user frame dispatch to ensure pong responses
 * are never delayed by user handler processing (Issue #15).
 */
export class HeartbeatResponder {
  private readonly sendPong: (frame: HeartbeatPongFrame) => void;
  private _lastPingAt: number | undefined;

  constructor(sendPong: (frame: HeartbeatPongFrame) => void) {
    this.sendPong = sendPong;
  }

  /**
   * Handle an incoming frame. If it's a ping, respond with pong immediately.
   * Returns true if the frame was a ping (handled), false otherwise.
   */
  handleFrame(frame: GatewayFrame): boolean {
    if (frame.kind !== "heartbeat.ping") {
      return false;
    }

    this._lastPingAt = frame.timestamp;

    const pong: HeartbeatPongFrame = {
      kind: "heartbeat.pong",
      timestamp: frame.timestamp,
    };
    this.sendPong(pong);

    return true;
  }

  /**
   * Timestamp of the last ping received, for diagnostics.
   */
  get lastPingAt(): number | undefined {
    return this._lastPingAt;
  }
}
