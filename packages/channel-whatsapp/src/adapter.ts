import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import {
  ChannelAuthExpiredError,
  ChannelLoadError,
  ChannelSendError,
  ChannelSessionReplacedError,
} from "@templar/errors";

import type { AuthStateProvider } from "./auth-state.js";
import { FileAuthState } from "./auth-state.js";
import { WHATSAPP_CAPABILITIES } from "./capabilities.js";
import { type ConnectionUpdate, parseWhatsAppConfig, type WhatsAppConfig } from "./config.js";
import { normalizeMessage, type WAMessage } from "./normalizer.js";
import { renderMessage, type WhatsAppSendable } from "./renderer.js";

// ---------------------------------------------------------------------------
// Minimal Baileys types (avoid hard coupling at import time)
// ---------------------------------------------------------------------------

interface WASocket extends WhatsAppSendable {
  ev: {
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
  end(error: Error | undefined): void;
  logout(): Promise<void>;
  user: { id: string } | null | undefined;
}

// ---------------------------------------------------------------------------
// Disconnect reason codes (from Baileys / @hapi/boom)
// ---------------------------------------------------------------------------

const DisconnectReason = {
  loggedOut: 401,
  timedOut: 408,
  badSession: 411,
  connectionLost: 428,
  connectionReplaced: 440,
  restartRequired: 515,
} as const;

// ---------------------------------------------------------------------------
// Lazy loader (Decision 16A)
// ---------------------------------------------------------------------------

const loadBaileys = lazyLoad("whatsapp", "@whiskeysockets/baileys", (mod) => ({
  makeWASocket: (mod as Record<string, unknown>).default as unknown as (
    opts: Record<string, unknown>,
  ) => WASocket,
  makeCacheableSignalKeyStore: (mod as Record<string, unknown>)
    .makeCacheableSignalKeyStore as unknown as (keys: unknown, logger: unknown) => unknown,
  fetchLatestBaileysVersion: (mod as Record<string, unknown>)
    .fetchLatestBaileysVersion as unknown as () => Promise<{ version: number[] }>,
  Browsers: (mod as Record<string, unknown>).Browsers as unknown as Record<
    string,
    (browser: string) => readonly [string, string, string]
  >,
}));

// ---------------------------------------------------------------------------
// WhatsAppChannel adapter
// ---------------------------------------------------------------------------

/**
 * WhatsApp channel adapter using Baileys (WhiskeySockets) v6.
 *
 * Extends BaseChannelAdapter with:
 * - Injectable auth state provider (default: file-based with debounced writes)
 * - QR code and connection lifecycle callbacks
 * - Token-bucket rate limiter with jitter (anti-ban)
 * - Exponential backoff reconnection with disconnect reason routing
 * - Lazy-loaded Baileys dependency
 */
export class WhatsAppChannel extends BaseChannelAdapter<WAMessage, WhatsAppSendable> {
  private readonly config: WhatsAppConfig;
  private readonly authState: AuthStateProvider;
  private socket: WASocket | undefined;
  private reconnectAttempt = 0;
  private reconnecting = false;
  private handler: ((raw: WAMessage) => void) | undefined;

  // Rate limiting state
  private readonly sendQueue: Array<{
    readonly resolve: () => void;
    readonly reject: (error: Error) => void;
    readonly message: OutboundMessage;
  }> = [];
  private processing = false;
  private lastSendTime = 0;
  private tokenBucket: number;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseWhatsAppConfig(rawConfig);
    super({
      name: "whatsapp",
      capabilities: WHATSAPP_CAPABILITIES,
      normalizer: (msg: WAMessage) => normalizeMessage(msg),
      renderer: (message: OutboundMessage, socket: WhatsAppSendable) =>
        renderMessage(message, socket),
    });
    this.config = config;
    this.authState = this.config.authStateProvider ?? new FileAuthState(this.config.authStatePath);
    this.tokenBucket = this.config.burstLimit;
  }

  protected async doConnect(): Promise<void> {
    if (this.reconnecting) return;

    try {
      const baileys = await loadBaileys();
      const authState = await this.authState.getState();
      const { version } = await baileys.fetchLatestBaileysVersion();

      this.emitConnectionUpdate({ status: "connecting" });

      this.socket = baileys.makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: baileys.makeCacheableSignalKeyStore(authState.keys, console),
        },
        browser: [...this.config.browser],
        connectTimeoutMs: this.config.connectTimeoutMs,
        printQRInTerminal: this.config.printQRInTerminal,
        shouldSyncHistoryMessage: this.config.syncHistory ? () => true : () => false,
      });

      this.wireEvents();

      // Wait for connection to open (or fail)
      await this.waitForConnection();
    } catch (error) {
      if (
        error instanceof ChannelLoadError ||
        error instanceof ChannelAuthExpiredError ||
        error instanceof ChannelSessionReplacedError
      ) {
        throw error;
      }
      throw new ChannelLoadError(
        "whatsapp",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (!this.socket) return;

    // Cancel any pending reconnection
    this.reconnecting = false;
    this.reconnectAttempt = 0;

    this.socket.end(undefined);
    this.socket = undefined;

    // Flush pending auth state writes
    if ("flush" in this.authState && typeof this.authState.flush === "function") {
      await (this.authState as FileAuthState).flush();
    }

    this.emitConnectionUpdate({ status: "closed" });
  }

  protected override async doSend(message: OutboundMessage): Promise<void> {
    // Rate-limited send via queue
    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ resolve, reject, message });
      void this.processQueue();
    });
  }

  protected registerListener(callback: (raw: WAMessage) => void): void {
    this.handler = callback;
  }

  protected getClient(): WhatsAppSendable {
    if (!this.socket) {
      throw new ChannelLoadError("whatsapp", "Socket not initialized");
    }
    return this.socket;
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  private wireEvents(): void {
    const sock = this.socket;
    if (!sock) return;

    // Credential persistence
    sock.ev.on("creds.update", async (...args: unknown[]) => {
      const creds = args[0] as Record<string, unknown>;
      await this.authState.saveCreds(creds);
    });

    // Connection lifecycle
    sock.ev.on("connection.update", async (...args: unknown[]) => {
      const update = args[0] as {
        connection?: string;
        lastDisconnect?: { error?: Error & { output?: { statusCode?: number } } };
        qr?: string;
      };

      // QR code received
      if (update.qr != null && this.config.onQR) {
        this.config.onQR(update.qr);
      }
      if (update.qr != null) {
        this.emitConnectionUpdate({ status: "connecting", qr: update.qr });
      }

      // Connection opened
      if (update.connection === "open") {
        this.setConnected(true);
        this.reconnectAttempt = 0;
        this.reconnecting = false;
        this.emitConnectionUpdate({ status: "open" });
      }

      // Connection closed
      if (update.connection === "close") {
        this.setConnected(false);
        const statusCode = update.lastDisconnect?.error?.output?.statusCode ?? 500;
        await this.handleDisconnect(statusCode);
      }
    });

    // Incoming messages
    sock.ev.on("messages.upsert", async (...args: unknown[]) => {
      const { type, messages } = args[0] as {
        type: string;
        messages: WAMessage[];
      };

      // Skip history sync messages unless configured
      if (type !== "notify" && !this.config.syncHistory) return;

      if (!this.handler) return;

      for (const msg of messages) {
        try {
          // Tag history sync messages via a wrapper
          if (type !== "notify") {
            const callback = this.handler;
            // For history sync, we use a modified message with metadata
            // The handler (from base class) will normalize and call user handler
            callback(msg);
          } else {
            this.handler(msg);
          }
        } catch (error) {
          console.error(
            "[WhatsAppChannel] Error handling message:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Connection wait
  // ---------------------------------------------------------------------------

  private waitForConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const sock = this.socket;
      if (!sock) {
        reject(new ChannelLoadError("whatsapp", "Socket not initialized"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new ChannelLoadError("whatsapp", "Connection timed out"));
      }, this.config.connectTimeoutMs);

      sock.ev.on("connection.update", (...args: unknown[]) => {
        const update = args[0] as { connection?: string };
        if (update.connection === "open") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Disconnect handling & reconnection
  // ---------------------------------------------------------------------------

  private async handleDisconnect(statusCode: number): Promise<void> {
    // Fatal: logged out — auth state is invalid
    if (statusCode === DisconnectReason.loggedOut) {
      await this.authState.clear();
      this.emitConnectionUpdate({
        status: "failed",
        reason: "Logged out — re-authentication required",
      });
      return;
    }

    // Fatal: another client replaced this connection
    if (statusCode === DisconnectReason.connectionReplaced) {
      this.emitConnectionUpdate({
        status: "failed",
        reason: "Connection replaced by another client",
      });
      return;
    }

    // Fatal: bad session — clear auth and stop
    if (statusCode === DisconnectReason.badSession) {
      await this.authState.clear();
      this.emitConnectionUpdate({
        status: "failed",
        reason: "Invalid session — re-authentication required",
      });
      return;
    }

    // Retriable: attempt reconnection with exponential backoff
    if (this.reconnectAttempt >= this.config.maxReconnectAttempts) {
      this.emitConnectionUpdate({
        status: "failed",
        reason: `Max reconnect attempts (${this.config.maxReconnectAttempts}) exhausted`,
      });
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempt += 1;

    const baseDelay = Math.min(
      this.config.reconnectBaseDelay * 2 ** (this.reconnectAttempt - 1),
      this.config.reconnectMaxDelay,
    );
    const jitter = baseDelay * this.config.jitter * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseDelay + jitter);

    this.emitConnectionUpdate({
      status: "reconnecting",
      attempt: this.reconnectAttempt,
      reason: `Disconnected (code ${statusCode}), retrying in ${Math.round(delay)}ms`,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, delay));

    // Guard: if disconnect() was called during the delay, stop
    if (!this.reconnecting) return;

    this.reconnecting = false;
    this.socket = undefined;

    try {
      await this.connect();
    } catch (error) {
      console.error(
        "[WhatsAppChannel] Reconnection failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rate-limited send queue (token bucket with jitter)
  // ---------------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.sendQueue.length > 0) {
        const item = this.sendQueue.shift();
        if (!item) break;

        // Refill tokens based on elapsed time
        const now = Date.now();
        const elapsed = now - this.lastSendTime;
        const refill = Math.floor(elapsed / this.config.messageDelay);
        this.tokenBucket = Math.min(this.config.burstLimit, this.tokenBucket + refill);

        // Wait if no tokens available
        if (this.tokenBucket <= 0) {
          const waitTime =
            this.config.messageDelay +
            Math.floor(Math.random() * this.config.messageDelay * this.config.jitter);
          await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
          this.tokenBucket = 1;
        }

        this.tokenBucket -= 1;
        this.lastSendTime = Date.now();

        try {
          if (!this.socket || !this.isConnected) {
            item.reject(new ChannelSendError("whatsapp", "Connection lost while sending"));
            continue;
          }
          await renderMessage(item.message, this.socket);
          item.resolve();
        } catch (error) {
          item.reject(
            error instanceof ChannelSendError
              ? error
              : new ChannelSendError(
                  "whatsapp",
                  error instanceof Error ? error.message : String(error),
                  { cause: error instanceof Error ? error : undefined },
                ),
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private emitConnectionUpdate(update: ConnectionUpdate): void {
    if (this.config.onConnectionUpdate) {
      this.config.onConnectionUpdate(update);
    }
  }

  /**
   * Get the underlying Baileys socket instance.
   * Useful for advanced operations beyond the adapter interface
   * (e.g., reading contacts, group operations, presence updates).
   */
  getSocket(): WASocket | undefined {
    return this.socket;
  }
}
