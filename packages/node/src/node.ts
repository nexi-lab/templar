import {
  NodeAuthFailureError,
  NodeHandlerError,
  NodeReconnectExhaustedError,
  NodeRegistrationTimeoutError,
  NodeStartError,
} from "@templar/errors";
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
 * - Graceful shutdown via AbortController
 */
export class TemplarNode {
  private readonly resolvedConfig: ResolvedNodeConfig;
  private readonly wsClient: WsClient;
  private readonly reconnectStrategy: ReconnectStrategy;
  private readonly heartbeatResponder: HeartbeatResponder;

  private _state: NodeState = "disconnected";
  private _sessionId: string | undefined;
  private abortController: AbortController | undefined;

  // Event handlers (immutable arrays)
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
    this.wsClient.setMaxFrameSize(this.resolvedConfig.maxFrameSize);

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
      throw new NodeStartError(this.resolvedConfig.nodeId, this._state);
    }

    this._state = "connecting";
    this.abortController = new AbortController();

    try {
      await this.connectAndRegister(this.abortController.signal);
    } catch (err) {
      this._state = "disconnected";
      this.abortController = undefined;
      throw err;
    }
  }

  /**
   * Gracefully disconnect: abort in-flight ops, send deregister, close WS.
   */
  async stop(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    // Abort all in-flight operations (cancels connect, ack wait, reconnection)
    this.abortController?.abort();
    this.abortController = undefined;

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
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
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

  onConnected(handler: ConnectedHandler): () => void {
    this.connectedHandlers = [...this.connectedHandlers, handler];
    return () => {
      this.connectedHandlers = this.connectedHandlers.filter((h) => h !== handler);
    };
  }

  onDisconnected(handler: DisconnectedHandler): () => void {
    this.disconnectedHandlers = [...this.disconnectedHandlers, handler];
    return () => {
      this.disconnectedHandlers = this.disconnectedHandlers.filter((h) => h !== handler);
    };
  }

  onReconnecting(handler: ReconnectingHandler): () => void {
    this.reconnectingHandlers = [...this.reconnectingHandlers, handler];
    return () => {
      this.reconnectingHandlers = this.reconnectingHandlers.filter((h) => h !== handler);
    };
  }

  onReconnected(handler: ReconnectedHandler): () => void {
    this.reconnectedHandlers = [...this.reconnectedHandlers, handler];
    return () => {
      this.reconnectedHandlers = this.reconnectedHandlers.filter((h) => h !== handler);
    };
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers = [...this.messageHandlers, handler];
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onSessionUpdate(handler: SessionUpdateHandler): () => void {
    this.sessionUpdateHandlers = [...this.sessionUpdateHandlers, handler];
    return () => {
      this.sessionUpdateHandlers = this.sessionUpdateHandlers.filter((h) => h !== handler);
    };
  }

  onConfigChanged(handler: ConfigChangedHandler): () => void {
    this.configChangedHandlers = [...this.configChangedHandlers, handler];
    return () => {
      this.configChangedHandlers = this.configChangedHandlers.filter((h) => h !== handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers = [...this.errorHandlers, handler];
    return () => {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    };
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  private async connectAndRegister(signal: AbortSignal): Promise<void> {
    const token = await this.resolveToken();

    // Combine lifecycle abort signal with connection timeout
    const connectionSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.resolvedConfig.connectionTimeout),
    ]);

    await this.wsClient.connect(this.resolvedConfig.gatewayUrl, token, connectionSignal);

    // Send register frame
    const registerFrame: NodeRegisterFrame = {
      kind: "node.register",
      nodeId: this.resolvedConfig.nodeId,
      capabilities: this.resolvedConfig.capabilities,
      token,
    };
    this.wsClient.send(registerFrame);

    // Wait for register ack
    const sessionId = await this.waitForRegisterAck(signal);
    this._sessionId = sessionId;
    this._state = "connected";
    this.reconnectStrategy.reset();

    for (const handler of this.connectedHandlers) {
      handler(sessionId);
    }
  }

  private waitForRegisterAck(signal: AbortSignal): Promise<string> {
    const timeout = this.resolvedConfig.registrationTimeout;
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        const reason = signal.reason instanceof Error ? signal.reason : new Error("Aborted");
        reject(reason);
        return;
      }

      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => {
          this._pendingAckResolve = undefined;
          reject(new NodeRegistrationTimeoutError(this.resolvedConfig.nodeId, timeout));
        });
      }, timeout);

      const onAbort = () => {
        settle(() => {
          this._pendingAckResolve = undefined;
          const reason = signal.reason instanceof Error ? signal.reason : new Error("Aborted");
          reject(reason);
        });
      };

      signal.addEventListener("abort", onAbort, { once: true });

      this._pendingAckResolve = (sessionId: string) => {
        settle(() => resolve(sessionId));
      };
    });
  }

  private _pendingAckResolve: ((sessionId: string) => void) | undefined;

  // -------------------------------------------------------------------------
  // Frame Handling
  // -------------------------------------------------------------------------

  private handleFrame(frame: GatewayFrame): void {
    // 1. Heartbeat — protocol level, BEFORE user dispatch
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

    const promises: Promise<void>[] = [];

    for (const handler of this.messageHandlers) {
      try {
        const result = handler(lane, message);
        if (result instanceof Promise) {
          promises.push(
            result.catch((err: unknown) => {
              const cause = err instanceof Error ? err : new Error(String(err));
              this.emitError(
                new NodeHandlerError("message-handler", cause.message, cause),
                "message-handler",
              );
            }),
          );
        }
      } catch (err) {
        const cause = err instanceof Error ? err : new Error(String(err));
        this.emitError(
          new NodeHandlerError("message-handler", cause.message, cause),
          "message-handler",
        );
      }
    }

    // Send ack after all handlers complete (sync + async)
    const sendAck = () => {
      this.wsClient.send({
        kind: "lane.message.ack",
        messageId: message.id,
      });
    };

    if (promises.length > 0) {
      void Promise.allSettled(promises).then(sendAck);
    } else {
      sendAck();
    }
  }

  private dispatchSessionUpdate(state: SessionState): void {
    for (const handler of this.sessionUpdateHandlers) {
      try {
        handler(state);
      } catch (err) {
        const cause = err instanceof Error ? err : new Error(String(err));
        this.emitError(
          new NodeHandlerError("session-update-handler", cause.message, cause),
          "session-update-handler",
        );
      }
    }
  }

  private dispatchConfigChanged(fields: readonly string[]): void {
    for (const handler of this.configChangedHandlers) {
      try {
        handler(fields);
      } catch (err) {
        const cause = err instanceof Error ? err : new Error(String(err));
        this.emitError(
          new NodeHandlerError("config-changed-handler", cause.message, cause),
          "config-changed-handler",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Reconnection
  // -------------------------------------------------------------------------

  private handleClose(code: number, reason: string): void {
    // If we're intentionally stopping, don't reconnect
    if (this.abortController?.signal.aborted) {
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
      this.emitError(
        new NodeAuthFailureError(this.resolvedConfig.nodeId, code, reason),
        "auth-failure",
      );
      return;
    }

    // Start reconnection
    this._state = "reconnecting";
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const signal = this.abortController?.signal;
    if (!signal || signal.aborted) {
      return;
    }

    if (this.reconnectStrategy.exhausted) {
      this._state = "disconnected";
      this._sessionId = undefined;
      this.emitError(
        new NodeReconnectExhaustedError(this.resolvedConfig.nodeId, this.reconnectStrategy.attempt),
        "reconnect-exhausted",
      );
      return;
    }

    const attempt = this.reconnectStrategy.attempt;

    const { cancel, delay } = this.reconnectStrategy.schedule(async () => {
      await this.attemptReconnect();
    });

    // Cancel scheduled reconnect on abort
    const onAbort = () => cancel();
    signal.addEventListener("abort", onAbort, { once: true });

    // Emit reconnecting with the current attempt number and computed delay
    for (const handler of this.reconnectingHandlers) {
      handler(attempt, delay);
    }
  }

  private async attemptReconnect(): Promise<void> {
    const signal = this.abortController?.signal;
    if (!signal || signal.aborted) {
      return;
    }

    try {
      // Dispose previous WS instance (fresh instance for reconnect)
      this.wsClient.dispose();

      await this.connectAndRegister(signal);

      // On success, emit reconnected
      const sessionId = this._sessionId;
      if (sessionId) {
        for (const handler of this.reconnectedHandlers) {
          handler(sessionId);
        }
      }
    } catch (err) {
      // Stopped during reconnect — silently exit
      if (signal.aborted) {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, "reconnect-attempt");

      // Schedule next attempt if still reconnecting
      if (this._state === "reconnecting") {
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
