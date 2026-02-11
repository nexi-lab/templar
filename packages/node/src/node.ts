import type {
  GatewayFrame,
  LaneMessageFrame,
  NodeRegisterFrame,
  SessionState,
} from "@templar/gateway-protocol";
import { HeartbeatResponder } from "./heartbeat-responder.js";
import { ReconnectStrategy } from "./reconnect.js";
import type {
  ConfigChangedHandler,
  ConnectedHandler,
  DisconnectedHandler,
  ErrorHandler,
  MessageHandler,
  NodeConfig,
  NodeState,
  ReconnectedHandler,
  ReconnectingHandler,
  ResolvedNodeConfig,
  SessionUpdateHandler,
} from "./types.js";
import { resolveNodeConfig } from "./types.js";
import { WsClient, type WsClientFactory } from "./ws-client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Close codes that indicate auth failure — do NOT reconnect */
const AUTH_FAILURE_CODES = new Set([1008, 4401, 4403]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplarNodeDeps {
  readonly wsFactory?: WsClientFactory;
}

// ---------------------------------------------------------------------------
// TemplarNode
// ---------------------------------------------------------------------------

/**
 * Local device agent runtime that connects to a TemplarGateway
 * via WebSocket and handles the GatewayFrame protocol.
 *
 * Responsibilities:
 * - WebSocket connection + auth
 * - Heartbeat response (protocol level, before user dispatch)
 * - Frame dispatch to user-registered handlers
 * - Automatic reconnection with exponential backoff + full jitter
 * - Graceful shutdown
 */
export class TemplarNode {
  private readonly resolvedConfig: ResolvedNodeConfig;
  private readonly wsClient: WsClient;
  private readonly reconnectStrategy: ReconnectStrategy;
  private readonly heartbeatResponder: HeartbeatResponder;

  private _state: NodeState = "disconnected";
  private _sessionId: string | undefined;
  private cancelReconnect: (() => void) | undefined;
  private stopping = false;

  // Event handlers (immutable arrays — Issue #5A)
  private connectedHandlers: readonly ConnectedHandler[] = [];
  private disconnectedHandlers: readonly DisconnectedHandler[] = [];
  private reconnectingHandlers: readonly ReconnectingHandler[] = [];
  private reconnectedHandlers: readonly ReconnectedHandler[] = [];
  private messageHandlers: readonly MessageHandler[] = [];
  private sessionUpdateHandlers: readonly SessionUpdateHandler[] = [];
  private configChangedHandlers: readonly ConfigChangedHandler[] = [];
  private errorHandlers: readonly ErrorHandler[] = [];

  constructor(config: NodeConfig, deps: TemplarNodeDeps = {}) {
    this.resolvedConfig = resolveNodeConfig(config);

    this.wsClient = new WsClient(deps.wsFactory);
    this.wsClient.setNodeId(this.resolvedConfig.nodeId);

    this.reconnectStrategy = new ReconnectStrategy(this.resolvedConfig.reconnect);

    this.heartbeatResponder = new HeartbeatResponder((pong) => {
      this.wsClient.send(pong);
    });

    // Wire WS client events
    this.wsClient.onMessage((frame) => this.handleFrame(frame));
    this.wsClient.onClose((code, reason) => this.handleClose(code, reason));
    this.wsClient.onError((error) => this.emitError(error, "ws-error"));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect to the gateway, register, and wait for acknowledgement.
   */
  async start(): Promise<void> {
    if (this._state !== "disconnected") {
      throw new Error(`Cannot start: node is in state "${this._state}"`);
    }

    this._state = "connecting";
    try {
      await this.connectAndRegister();
    } catch (err) {
      this._state = "disconnected";
      throw err;
    }
  }

  /**
   * Gracefully disconnect: send deregister, cancel reconnection, close WS.
   */
  async stop(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    this.stopping = true;

    // Cancel any pending reconnection
    if (this.cancelReconnect) {
      this.cancelReconnect();
      this.cancelReconnect = undefined;
    }

    // Send deregister if connected
    if (this._state === "connected") {
      const frame: GatewayFrame = {
        kind: "node.deregister",
        nodeId: this.resolvedConfig.nodeId,
      };
      this.wsClient.send(frame);
    }

    // Close WS
    this.wsClient.close(1000, "Node stopping");
    this.wsClient.dispose();

    this._state = "disconnected";
    this._sessionId = undefined;
    this.stopping = false;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  get state(): NodeState {
    return this._state;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  get config(): ResolvedNodeConfig {
    return this.resolvedConfig;
  }

  // -------------------------------------------------------------------------
  // Event Registration
  // -------------------------------------------------------------------------

  onConnected(handler: ConnectedHandler): void {
    this.connectedHandlers = [...this.connectedHandlers, handler];
  }

  onDisconnected(handler: DisconnectedHandler): void {
    this.disconnectedHandlers = [...this.disconnectedHandlers, handler];
  }

  onReconnecting(handler: ReconnectingHandler): void {
    this.reconnectingHandlers = [...this.reconnectingHandlers, handler];
  }

  onReconnected(handler: ReconnectedHandler): void {
    this.reconnectedHandlers = [...this.reconnectedHandlers, handler];
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers = [...this.messageHandlers, handler];
  }

  onSessionUpdate(handler: SessionUpdateHandler): void {
    this.sessionUpdateHandlers = [...this.sessionUpdateHandlers, handler];
  }

  onConfigChanged(handler: ConfigChangedHandler): void {
    this.configChangedHandlers = [...this.configChangedHandlers, handler];
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers = [...this.errorHandlers, handler];
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  private async connectAndRegister(): Promise<void> {
    const token = await this.resolveToken();

    await this.wsClient.connect(this.resolvedConfig.gatewayUrl, token);

    // Send register frame
    const registerFrame: NodeRegisterFrame = {
      kind: "node.register",
      nodeId: this.resolvedConfig.nodeId,
      capabilities: this.resolvedConfig.capabilities,
      token,
    };
    this.wsClient.send(registerFrame);

    // Wait for register ack
    const sessionId = await this.waitForRegisterAck();
    this._sessionId = sessionId;
    this._state = "connected";
    this.reconnectStrategy.reset();

    for (const handler of this.connectedHandlers) {
      handler(sessionId);
    }
  }

  private waitForRegisterAck(): Promise<string> {
    const timeout = 10_000;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingAckResolve = undefined;
        reject(new Error(`Registration timed out after ${timeout}ms`));
      }, timeout);

      this._pendingAckResolve = (sessionId: string) => {
        clearTimeout(timer);
        resolve(sessionId);
      };
    });
  }

  private _pendingAckResolve: ((sessionId: string) => void) | undefined;

  // -------------------------------------------------------------------------
  // Frame Handling
  // -------------------------------------------------------------------------

  private handleFrame(frame: GatewayFrame): void {
    // 1. Heartbeat — protocol level, BEFORE user dispatch (Issue #15)
    if (this.heartbeatResponder.handleFrame(frame)) {
      return;
    }

    // 2. Registration ack (during connect/reconnect)
    if (frame.kind === "node.register.ack" && this._pendingAckResolve) {
      const resolve = this._pendingAckResolve;
      this._pendingAckResolve = undefined;
      resolve(frame.sessionId);
      return;
    }

    // 3. Dispatch based on frame kind
    switch (frame.kind) {
      case "lane.message":
        this.handleLaneMessage(frame);
        break;

      case "session.update":
        this.dispatchSessionUpdate(frame.state);
        break;

      case "config.changed":
        this.dispatchConfigChanged(frame.fields);
        break;

      case "error":
        this.emitError(
          new Error(`${frame.error.title}: ${frame.error.detail ?? ""}`),
          "gateway-error",
        );
        break;

      default:
        // Unknown or unhandled frames (lane.message.ack, etc.) — ignore
        break;
    }
  }

  private handleLaneMessage(frame: LaneMessageFrame): void {
    const { lane, message } = frame;

    for (const handler of this.messageHandlers) {
      try {
        const result = handler(lane, message);
        // Handle async rejections (Issue #6A)
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err));
            this.emitError(error, "message-handler");
          });
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitError(error, "message-handler");
      }
    }
  }

  private dispatchSessionUpdate(state: SessionState): void {
    for (const handler of this.sessionUpdateHandlers) {
      try {
        handler(state);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitError(error, "session-update-handler");
      }
    }
  }

  private dispatchConfigChanged(fields: readonly string[]): void {
    for (const handler of this.configChangedHandlers) {
      try {
        handler(fields);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitError(error, "config-changed-handler");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Reconnection
  // -------------------------------------------------------------------------

  private handleClose(code: number, reason: string): void {
    // If we're intentionally stopping, don't reconnect
    if (this.stopping) {
      return;
    }

    // Emit disconnected event
    for (const handler of this.disconnectedHandlers) {
      handler(code, reason);
    }

    // Auth-related close — do NOT reconnect
    if (AUTH_FAILURE_CODES.has(code)) {
      this._state = "disconnected";
      this._sessionId = undefined;
      this.emitError(new Error(`Authentication failure (code ${code}): ${reason}`), "auth-failure");
      return;
    }

    // Start reconnection
    this._state = "reconnecting";
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectStrategy.exhausted) {
      this._state = "disconnected";
      this._sessionId = undefined;
      this.emitError(
        new Error(`Reconnection failed after ${this.reconnectStrategy.attempt} attempts`),
        "reconnect-exhausted",
      );
      return;
    }

    const attempt = this.reconnectStrategy.attempt;

    const { cancel, delay } = this.reconnectStrategy.schedule(async () => {
      this.cancelReconnect = undefined;
      await this.attemptReconnect();
    });
    this.cancelReconnect = cancel;

    // Emit reconnecting with the current attempt number and computed delay
    for (const handler of this.reconnectingHandlers) {
      handler(attempt, delay);
    }
  }

  private async attemptReconnect(): Promise<void> {
    try {
      // Dispose previous WS instance (fresh instance — Issue #16)
      this.wsClient.dispose();

      await this.connectAndRegister();

      // On success, emit reconnected
      const sessionId = this._sessionId;
      if (sessionId) {
        for (const handler of this.reconnectedHandlers) {
          handler(sessionId);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, "reconnect-attempt");

      // Schedule next attempt if not stopping
      if (!this.stopping && this._state === "reconnecting") {
        this.scheduleReconnect();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async resolveToken(): Promise<string> {
    const { token } = this.resolvedConfig;
    if (typeof token === "string") {
      return token;
    }
    return token();
  }

  private emitError(error: Error, context?: string): void {
    if (this.errorHandlers.length === 0) {
      // No error handler — log to stderr
      console.error(`[TemplarNode] Unhandled error (${context ?? "unknown"}):`, error.message);
      return;
    }
    for (const handler of this.errorHandlers) {
      handler(error, context);
    }
  }
}
