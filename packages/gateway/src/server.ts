import type { IncomingMessage } from "node:http";
import type { GatewayFrame } from "@templar/gateway-protocol";
import { safeParseFrame } from "@templar/gateway-protocol";

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
// GatewayServer
// ---------------------------------------------------------------------------

/**
 * WebSocket server wrapper with auth, frame parsing, and event dispatch.
 */
export class GatewayServer {
  private wss: WebSocketServerLike | undefined;
  private connections: Map<string, WebSocketLike> = new Map();
  private frameHandlers: readonly FrameHandler[] = [];
  private connectHandlers: readonly ConnectionHandler[] = [];
  private disconnectHandlers: readonly DisconnectHandler[] = [];
  private readonly config: GatewayServerConfig;
  private readonly factory: WsServerFactory | undefined;

  constructor(config: GatewayServerConfig, factory?: WsServerFactory) {
    this.config = config;
    this.factory = factory;
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
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Send a frame to a specific node.
   */
  sendFrame(nodeId: string, frame: GatewayFrame): void {
    const ws = this.connections.get(nodeId);
    if (ws && ws.readyState === 1) {
      // OPEN
      ws.send(JSON.stringify(frame));
    }
  }

  /**
   * Register a frame handler.
   */
  onFrame(handler: FrameHandler): void {
    this.frameHandlers = [...this.frameHandlers, handler];
  }

  /**
   * Register a connection handler.
   */
  onConnect(handler: ConnectionHandler): void {
    this.connectHandlers = [...this.connectHandlers, handler];
  }

  /**
   * Register a disconnect handler.
   */
  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers = [...this.disconnectHandlers, handler];
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

  private handleConnection(ws: WebSocketLike, req: IncomingMessage): void {
    // Extract nodeId from query param or generate one
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const nodeId = url.searchParams.get("nodeId") ?? `node-${Date.now()}`;

    this.connections.set(nodeId, ws);

    for (const handler of this.connectHandlers) {
      handler(nodeId);
    }

    ws.on("message", (data: unknown) => {
      try {
        const raw: unknown = JSON.parse(String(data));
        const result = safeParseFrame(raw);
        if (result.success) {
          for (const handler of this.frameHandlers) {
            handler(nodeId, result.data as GatewayFrame);
          }
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
      this.connections.delete(nodeId);
      for (const handler of this.disconnectHandlers) {
        handler(nodeId, Number(code) || 1000, String(reason ?? ""));
      }
    });
  }
}
