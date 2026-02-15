import type { IncomingMessage } from "node:http";
import type { GatewayFrame } from "./protocol/index.js";
import { safeParseFrame } from "./protocol/index.js";
import { createEmitter, type Emitter } from "./utils/emitter.js";
import { SlidingWindowRateLimiter } from "./utils/rate-limiter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenValidator = (token: string) => boolean | Promise<boolean>;
export type FrameHandler = (nodeId: string, frame: GatewayFrame) => void;
export type ConnectionHandler = (nodeId: string) => void;
export type DisconnectHandler = (nodeId: string, code: number, reason: string) => void;

export interface GatewayServerConfig {
  readonly port: number;
  readonly validateToken: TokenValidator;
  /** Max concurrent connections (default: 1024). 0 = unlimited. */
  readonly maxConnections?: number;
  /** Max frames per second per connection (default: 100). 0 = unlimited. */
  readonly maxFramesPerSecond?: number;
}

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  readyState: number;
}

export interface WebSocketServerLike {
  on(event: string, handler: (...args: unknown[]) => void): void;
  close(cb?: (err?: Error) => void): void;
  clients: Set<WebSocketLike>;
}

/**
 * Factory for creating a WebSocket server.
 * Injectable for testing.
 */
export type WsServerFactory = (options: {
  port: number;
  verifyClient: (
    info: { req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void,
  ) => void;
}) => WebSocketServerLike;

// ---------------------------------------------------------------------------
// Server Events
// ---------------------------------------------------------------------------

type GatewayServerEvents = {
  frame: [connectionId: string, frame: GatewayFrame];
  connect: [connectionId: string];
  disconnect: [connectionId: string, code: number, reason: string];
};

// ---------------------------------------------------------------------------
// GatewayServer
// ---------------------------------------------------------------------------

/**
 * WebSocket server wrapper with auth, frame parsing, rate limiting, and event dispatch.
 *
 * Connection IDs are ephemeral and auto-generated. They do NOT represent node identity —
 * node identity is established via the node.register frame after connection.
 */
export class GatewayServer {
  private wss: WebSocketServerLike | undefined;
  private connections: Map<string, WebSocketLike> = new Map();
  private readonly events: Emitter<GatewayServerEvents> = createEmitter();
  private readonly config: GatewayServerConfig;
  private readonly factory: WsServerFactory | undefined;
  private readonly rateLimiter: SlidingWindowRateLimiter | undefined;
  private connectionCounter = 0;

  constructor(config: GatewayServerConfig, factory?: WsServerFactory) {
    this.config = config;
    this.factory = factory;
    const maxFps = config.maxFramesPerSecond ?? 0;
    if (maxFps > 0) {
      this.rateLimiter = new SlidingWindowRateLimiter(maxFps);
    }
  }

  /**
   * Start the WebSocket server.
   */
  async start(): Promise<void> {
    const verifyClient = (
      info: { req: IncomingMessage },
      callback: (result: boolean, code?: number, message?: string) => void,
    ): void => {
      const authHeader = info.req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        callback(false, 401, "Missing or invalid Authorization header");
        return;
      }
      const token = authHeader.slice(7);
      const result = this.config.validateToken(token);
      if (result instanceof Promise) {
        result.then(
          (valid) => callback(valid, valid ? undefined : 403, valid ? undefined : "Forbidden"),
          () => callback(false, 500, "Auth validation error"),
        );
      } else {
        callback(result, result ? undefined : 403, result ? undefined : "Forbidden");
      }
    };

    if (this.factory) {
      this.wss = this.factory({ port: this.config.port, verifyClient });
    } else {
      const { WebSocketServer } = await import("ws");
      this.wss = new WebSocketServer({
        port: this.config.port,
        verifyClient,
      }) as unknown as WebSocketServerLike;
    }

    this.wss.on("connection", (...args: unknown[]) => {
      this.handleConnection(args[0] as WebSocketLike, args[1] as IncomingMessage);
    });
  }

  /**
   * Stop the server and close all connections.
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }
      // Close all connections
      for (const ws of this.connections.values()) {
        ws.close(1001, "Server shutting down");
      }
      this.connections = new Map();

      this.wss.close((err) => {
        this.wss = undefined;
        this.events.clear();
        this.rateLimiter?.clear();
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Send a frame to a specific connection.
   */
  sendFrame(connectionId: string, frame: GatewayFrame): void {
    const ws = this.connections.get(connectionId);
    if (ws && ws.readyState === 1) {
      // OPEN
      ws.send(JSON.stringify(frame));
    }
  }

  /**
   * Register a frame handler. Returns a disposer function.
   */
  onFrame(handler: FrameHandler): () => void {
    return this.events.on("frame", handler);
  }

  /**
   * Register a connection handler. Returns a disposer function.
   */
  onConnect(handler: ConnectionHandler): () => void {
    return this.events.on("connect", handler);
  }

  /**
   * Register a disconnect handler. Returns a disposer function.
   */
  onDisconnect(handler: DisconnectHandler): () => void {
    return this.events.on("disconnect", handler);
  }

  /**
   * Get the number of active connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleConnection(ws: WebSocketLike, _req: IncomingMessage): void {
    // Check max connections limit (Issue 16)
    const maxConns = this.config.maxConnections ?? 0;
    if (maxConns > 0 && this.connections.size >= maxConns) {
      ws.close(1013, "Maximum connections reached");
      return;
    }

    // Generate ephemeral connection ID (Issue 2)
    // Node identity is established via node.register frame, not the connection itself.
    const connectionId = `conn-${++this.connectionCounter}`;

    this.connections.set(connectionId, ws);

    this.events.emit("connect", connectionId);

    ws.on("message", (data: unknown) => {
      // Rate limiting (Issue 3)
      if (this.rateLimiter && !this.rateLimiter.allow(connectionId)) {
        ws.send(
          JSON.stringify({
            kind: "error",
            error: {
              type: "about:blank",
              title: "Rate limited",
              status: 429,
              detail: "Too many frames per second",
            },
            timestamp: Date.now(),
          }),
        );
        return;
      }

      try {
        const raw: unknown = JSON.parse(String(data));
        const result = safeParseFrame(raw);
        if (result.success) {
          this.events.emit("frame", connectionId, result.data as GatewayFrame);
        } else {
          // Send error frame back
          ws.send(
            JSON.stringify({
              kind: "error",
              error: {
                type: "about:blank",
                title: "Invalid frame",
                status: 400,
                detail: result.error.message,
              },
              timestamp: Date.now(),
            }),
          );
        }
      } catch {
        ws.send(
          JSON.stringify({
            kind: "error",
            error: {
              type: "about:blank",
              title: "Parse error",
              status: 400,
              detail: "Failed to parse message as JSON",
            },
            timestamp: Date.now(),
          }),
        );
      }
    });

    ws.on("close", (code: unknown, reason: unknown) => {
      this.connections.delete(connectionId);
      this.rateLimiter?.remove(connectionId);
      this.events.emit("disconnect", connectionId, Number(code) || 1000, String(reason ?? ""));
    });
  }
}
