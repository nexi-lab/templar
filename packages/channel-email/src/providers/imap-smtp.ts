import { ChannelLoadError, ChannelSendError } from "@templar/errors";
import type { ImapSmtpConfig } from "../config.js";
import type { EmailAddress, EmailProvider, RawEmail, RenderedEmail } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDLE_RESTART_MS = 25 * 60 * 1000; // 25 minutes
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 60_000;

// ---------------------------------------------------------------------------
// ImapSmtpProvider
// ---------------------------------------------------------------------------

/**
 * Email provider using IMAP (receive) + SMTP (send).
 *
 * - IMAP IDLE for near-real-time new email detection
 * - Lazy SMTP transporter with connection pooling
 * - Auto-reconnect with exponential backoff + jitter
 * - IDLE restart every 25 minutes (RFC compliance)
 */
export class ImapSmtpProvider implements EmailProvider {
  readonly type = "imap-smtp" as const;

  private readonly config: ImapSmtpConfig;
  // biome-ignore lint/suspicious/noExplicitAny: ImapFlow type from external package
  private imapClient: any | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Nodemailer Transporter type
  private smtpTransporter: any | undefined;
  private connected = false;
  private reconnectAttempts = 0;
  private idleTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingListeners: Array<(raw: RawEmail) => void> = [];
  private listeners: Array<(raw: RawEmail) => void> = [];

  constructor(config: ImapSmtpConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // EmailProvider interface
  // -----------------------------------------------------------------------

  async connect(): Promise<void> {
    try {
      const { ImapFlow } = await import("imapflow");
      this.imapClient = new ImapFlow({
        host: this.config.imap.host,
        port: this.config.imap.port,
        secure: this.config.imap.secure,
        auth: {
          user: this.config.imap.auth.user,
          ...(this.config.imap.auth.pass !== undefined ? { pass: this.config.imap.auth.pass } : {}),
          ...(this.config.imap.auth.accessToken !== undefined
            ? { accessToken: this.config.imap.auth.accessToken }
            : {}),
        },
        logger: false,
      });

      await this.imapClient.connect();
      this.connected = true;
      this.reconnectAttempts = 0;

      // Register close handler for auto-reconnect
      this.imapClient.on("close", () => {
        this.connected = false;
        void this.reconnect();
      });

      // Wire pending listeners
      for (const handler of this.pendingListeners) {
        this.wireExistsListener(handler);
      }
      this.listeners.push(...this.pendingListeners);
      this.pendingListeners = [];

      // Start IDLE
      await this.startIdle();

      // Schedule periodic IDLE restart
      this.idleTimer = setInterval(() => {
        void this.restartIdle();
      }, IDLE_RESTART_MS);
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "email",
        `IMAP connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    // Clear timers
    if (this.idleTimer !== undefined) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Close SMTP transporter
    if (this.smtpTransporter) {
      this.smtpTransporter.close();
      this.smtpTransporter = undefined;
    }

    // Close IMAP connection
    if (this.imapClient) {
      try {
        await this.imapClient.logout();
      } catch {
        // Ignore logout errors during disconnect
      }
      this.imapClient = undefined;
    }

    this.connected = false;
    this.listeners = [];
  }

  listen(handler: (raw: RawEmail) => void): void {
    if (this.connected && this.imapClient) {
      this.wireExistsListener(handler);
      this.listeners.push(handler);
    } else {
      this.pendingListeners.push(handler);
    }
  }

  async send(email: RenderedEmail): Promise<string> {
    if (!this.connected) {
      throw new ChannelSendError("email", "Cannot send: not connected");
    }

    const transporter = await this.getOrCreateTransporter();

    try {
      const result = await transporter.sendMail({
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        text: email.text,
        html: email.html,
        inReplyTo: email.inReplyTo,
        references: email.references,
        attachments: email.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          cid: a.cid,
          contentDisposition: a.contentDisposition,
        })),
        headers: email.headers,
      });

      return result.messageId as string;
    } catch (error) {
      throw new ChannelSendError(
        "email",
        `SMTP send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Private — IMAP IDLE
  // -----------------------------------------------------------------------

  private async startIdle(): Promise<void> {
    if (!this.imapClient) return;

    try {
      const lock = await this.imapClient.getMailboxLock(this.config.mailbox);
      lock.release();

      await this.imapClient.idle();
    } catch {
      // IDLE may fail on some servers, that's OK
    }
  }

  private async restartIdle(): Promise<void> {
    if (!this.connected || !this.imapClient) return;
    await this.startIdle();
  }

  // -----------------------------------------------------------------------
  // Private — IMAP new email detection
  // -----------------------------------------------------------------------

  private wireExistsListener(handler: (raw: RawEmail) => void): void {
    if (!this.imapClient) return;

    this.imapClient.on("exists", (_data: { count?: number; prevCount?: number }) => {
      void this.handleNewMessages(handler);
    });
  }

  private async handleNewMessages(handler: (raw: RawEmail) => void): Promise<void> {
    if (!this.imapClient) return;

    try {
      const lock = await this.imapClient.getMailboxLock(this.config.mailbox);
      try {
        const result = await this.imapClient.fetchOne("*", { source: true });
        if (!result?.source) return;

        const rawEmail = await this.parseRawSource(result.source as Buffer);
        if (rawEmail) {
          handler(rawEmail);
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error(
        `[email/imap] Error fetching new message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private — Email parsing (uses postal-mime)
  // -----------------------------------------------------------------------

  private async parseRawSource(source: Buffer): Promise<RawEmail | undefined> {
    // Size guard
    if (source.length > this.config.maxEmailSize) {
      console.warn(
        `[email/imap] Skipping email exceeding size limit: ${source.length} > ${this.config.maxEmailSize}`,
      );
      return undefined;
    }

    const PostalMime = (await import("postal-mime")).default;
    const parser = new PostalMime();
    const parsed = await parser.parse(source);

    if (!parsed.from?.address || !parsed.messageId) return undefined;

    const headers = new Map<string, string>();
    for (const header of parsed.headers ?? []) {
      if (header.key && header.value) {
        headers.set(header.key, header.value);
      }
    }

    return {
      messageId: parsed.messageId,
      from: parseAddress(parsed.from),
      to: (parsed.to ?? []).map(parseAddress),
      cc: parsed.cc?.map(parseAddress),
      subject: parsed.subject ?? "",
      date: parsed.date ? new Date(parsed.date) : new Date(),
      inReplyTo: parsed.inReplyTo ?? undefined,
      references: parsed.references
        ? parsed.references.split(/\s+/).filter((r) => r.length > 0)
        : undefined,
      textBody: parsed.text ?? undefined,
      htmlBody: parsed.html ?? undefined,
      attachments: (parsed.attachments ?? []).map((a) => ({
        filename: a.filename ?? "attachment",
        mimeType: a.mimeType ?? "application/octet-stream",
        size: a.content?.byteLength ?? 0,
        content: Buffer.from(a.content ?? new ArrayBuffer(0)),
        contentId: a.contentId ?? undefined,
        disposition: a.disposition === "inline" ? "inline" : "attachment",
      })),
      headers,
    };
  }

  // -----------------------------------------------------------------------
  // Private — SMTP
  // -----------------------------------------------------------------------

  private async getOrCreateTransporter(): Promise<typeof this.smtpTransporter> {
    if (this.smtpTransporter) return this.smtpTransporter;

    const nodemailer = await import("nodemailer");
    const create = nodemailer.default?.createTransport ?? nodemailer.createTransport;

    this.smtpTransporter = create({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.auth.user,
        ...(this.config.smtp.auth.pass !== undefined ? { pass: this.config.smtp.auth.pass } : {}),
        ...(this.config.smtp.auth.accessToken !== undefined
          ? { type: "OAuth2", accessToken: this.config.smtp.auth.accessToken }
          : {}),
      },
      pool: true,
      maxConnections: this.config.smtp.pool.maxConnections,
      maxMessages: this.config.smtp.pool.maxMessages,
      rateDelta: this.config.smtp.pool.rateDelta,
      rateLimit: this.config.smtp.pool.rateLimit,
    });

    return this.smtpTransporter;
  }

  // -----------------------------------------------------------------------
  // Private — Reconnection
  // -----------------------------------------------------------------------

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[email/imap] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
      );
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    const jitter = Math.random() * baseDelay * 0.3;
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.imapClient) {
          await this.imapClient.connect();
          this.connected = true;
          this.reconnectAttempts = 0;

          // Re-wire listeners (remove old ones first to avoid duplicates)
          this.imapClient.removeAllListeners?.("exists");
          for (const handler of this.listeners) {
            this.wireExistsListener(handler);
          }

          await this.startIdle();
        }
      } catch (error) {
        console.warn(
          `[email/imap] Reconnect attempt ${this.reconnectAttempts} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        void this.reconnect();
      }
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAddress(addr: { address?: string; name?: string }): EmailAddress {
  return {
    address: addr.address ?? "",
    ...(addr.name ? { name: addr.name } : {}),
  };
}
