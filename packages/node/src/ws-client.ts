import { NodeFrameTooLargeError } from "@templar/errors";
import type { GatewayFrame } from "@templar/gateway/protocol";
import { safeParseFrame } from "@templar/gateway/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebSocketClientLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  readyState: number;
}

export interface WsClientOptions {
  readonly headers: Record<string, string>;
}

/**
 * Factory for creating WebSocket client instances.
 * Injectable for testing.
 */
export type WsClientFactory = (url: string, options: WsClientOptions) => WebSocketClientLike;

// ---------------------------------------------------------------------------
// WS Ready States
// ---------------------------------------------------------------------------

const WS_OPEN = 1;

// ---------------------------------------------------------------------------
// WsClient
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around a WebSocket client with frame serialization,
 * Zod validation on incoming frames, and injectable factory for testing.
 */
export class WsClient {
  private ws: WebSocketClientLike | undefined;
  private readonly factory: WsClientFactory | undefined;
  private nodeId = "";
  private _maxFrameSize = 0;

  private messageHandlers: readonly ((frame: GatewayFrame) => void)[] = [];
  private closeHandlers: readonly ((code: number, reason: string) => void)[] = [];
  private errorHandlers: readonly ((error: Error) => void)[] = [];

  constructor(factory?: WsClientFactory) {
    this.factory = factory;
  }

  /**
   * Set the maximum allowed frame size in bytes. 0 = no limit.
   */
  setMaxFrameSize(size: number): void {
    this._maxFrameSize = size;
  }

  /**
   * Connect to the gateway.
   * Resolves when the WebSocket is open.
   * Rejects on error, unexpected close, or signal abort during handshake.
   */
  async connect(url: string, token: string, signal?: AbortSignal): Promise<void> {
    // Check if already aborted
    if (signal?.aborted) {
      const reason = signal.reason instanceof Error ? signal.reason : new Error("Aborted");
      throw reason;
    }

    // Dispose previous connection if any
    if (this.ws) {
      this.disposeWs();
    }

    const target = new URL(url);
    target.searchParams.set("nodeId", this.nodeId);
    const urlWithNodeId = target.toString();

    const options: WsClientOptions = {
      headers: { Authorization: `Bearer ${token}` },
    };

    const ws = this.factory
      ? this.factory(urlWithNodeId, options)
      : await this.createDefaultWs(urlWithNodeId, options);

    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () => {
        settle(() => {
          this.disposeWs();
          const reason =
            signal?.reason instanceof Error ? signal.reason : new Error("Connection aborted");
          reject(reason);
        });
      };

      signal?.addEventListener("abort", onAbort, { once: true });

      ws.on("open", () => {
        settle(() => {
          this.wireEventHandlers(ws);
          resolve();
        });
      });

      ws.on("error", (err: unknown) => {
        settle(() => {
          const error = err instanceof Error ? err : new Error(String(err));
          reject(error);
        });
      });

      ws.on("close", (code: unknown, reason: unknown) => {
        settle(() => {
          reject(
            new Error(
              `WebSocket closed during connect: code=${String(code)}, reason=${String(reason)}`,
            ),
          );
        });
      });
    });
  }

  /**
   * Set the nodeId for the connection URL.
   */
  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  /**
   * Send a frame to the gateway.
   * Returns true if sent, false if not connected.
   */
  send(frame: GatewayFrame): boolean {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  /**
   * Close the WebSocket connection.
   */
  close(code?: number, reason?: string): void {
    if (this.ws) {
      this.ws.close(code, reason);
    }
  }

  /**
   * Register a handler for validated incoming frames.
   */
  onMessage(handler: (frame: GatewayFrame) => void): void {
    this.messageHandlers = [...this.messageHandlers, handler];
  }

  /**
   * Register a handler for connection close events.
   */
  onClose(handler: (code: number, reason: string) => void): void {
    this.closeHandlers = [...this.closeHandlers, handler];
  }

  /**
   * Register a handler for connection errors.
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers = [...this.errorHandlers, handler];
  }

  /**
   * Whether the WebSocket is currently open.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WS_OPEN;
  }

  /**
   * Dispose the client: close connection and clear all state.
   */
  dispose(): void {
    this.disposeWs();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private wireEventHandlers(ws: WebSocketClientLike): void {
    ws.on("message", (data: unknown) => {
      this.handleRawMessage(String(data));
    });

    ws.on("close", (code: unknown, reason: unknown) => {
      for (const handler of this.closeHandlers) {
        handler(Number(code) || 1000, String(reason ?? ""));
      }
    });

    ws.on("error", (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of this.errorHandlers) {
        handler(error);
      }
    });
  }

  private handleRawMessage(data: string): void {
    // Check frame size before parsing
    if (this._maxFrameSize > 0 && data.length > this._maxFrameSize) {
      const error = new NodeFrameTooLargeError(data.length, this._maxFrameSize);
      for (const handler of this.errorHandlers) {
        handler(error);
      }
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      // Invalid JSON — ignore
      return;
    }

    const result = safeParseFrame(raw);
    if (!result.success) {
      // Invalid frame — ignore
      return;
    }

    const frame = result.data as GatewayFrame;
    for (const handler of this.messageHandlers) {
      handler(frame);
    }
  }

  private disposeWs(): void {
    if (this.ws) {
      // Close if still open
      if (this.ws.readyState === WS_OPEN) {
        this.ws.close(1000, "Disposed");
      }
      this.ws = undefined;
    }
  }

  private async createDefaultWs(
    url: string,
    options: WsClientOptions,
  ): Promise<WebSocketClientLike> {
    const { WebSocket } = await import("ws");
    return new WebSocket(url, { headers: options.headers }) as unknown as WebSocketClientLike;
  }
}
