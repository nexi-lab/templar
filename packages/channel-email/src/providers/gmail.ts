import { ChannelLoadError, ChannelSendError } from "@templar/errors";
import type { GmailConfig } from "../config.js";
import type { EmailAddress, EmailProvider, RawEmail, RenderedEmail } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// GmailProvider
// ---------------------------------------------------------------------------

/**
 * Email provider using the Gmail API.
 *
 * - OAuth2 or Service Account authentication
 * - Polls `history.list()` for new messages at configurable interval
 * - Rate limit handling with exponential backoff
 * - Sends via `messages.send()` with raw RFC 5322 encoding
 */
export class GmailProvider implements EmailProvider {
  readonly type = "gmail" as const;

  private readonly config: GmailConfig;
  // biome-ignore lint/suspicious/noExplicitAny: Gmail API type from googleapis
  private gmail: any | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Auth client type from google-auth-library
  private auth: any | undefined;
  private connected = false;
  private lastHistoryId: string | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pendingListeners: Array<(raw: RawEmail) => void> = [];
  private listeners: Array<(raw: RawEmail) => void> = [];

  constructor(config: GmailConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // EmailProvider interface
  // -----------------------------------------------------------------------

  async connect(): Promise<void> {
    try {
      const { google } = await import("googleapis");

      // Set up authentication
      if (this.config.credentials.type === "oauth2") {
        this.auth = new google.auth.OAuth2(
          this.config.credentials.clientId,
          this.config.credentials.clientSecret,
        );
        this.auth.setCredentials({
          refresh_token: this.config.credentials.refreshToken,
        });
      } else {
        // Service account
        const { JWT } = await import("google-auth-library");
        let keyData: { client_email?: string; private_key?: string };
        try {
          keyData = JSON.parse(this.config.credentials.serviceAccountKey);
        } catch {
          throw new ChannelLoadError("email", "Gmail service account key is not valid JSON");
        }
        if (!keyData.client_email || !keyData.private_key) {
          throw new ChannelLoadError(
            "email",
            "Gmail service account key missing required fields (client_email, private_key)",
          );
        }
        this.auth = new JWT({
          email: keyData.client_email,
          key: keyData.private_key,
          scopes: ["https://www.googleapis.com/auth/gmail.modify"],
          subject: this.config.user,
        });
      }

      this.gmail = google.gmail({ version: "v1", auth: this.auth });

      // Get initial historyId from profile
      const profile = await this.gmail.users.getProfile({ userId: "me" });
      this.lastHistoryId = profile.data.historyId;

      this.connected = true;

      // Wire pending listeners and start polling if listeners exist
      this.listeners.push(...this.pendingListeners);
      this.pendingListeners = [];

      if (this.listeners.length > 0) {
        this.startPolling();
      }
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "email",
        `Gmail connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.gmail = undefined;
    this.auth = undefined;
    this.connected = false;
    this.listeners = [];
    this.lastHistoryId = undefined;
  }

  listen(handler: (raw: RawEmail) => void): void {
    if (this.connected && this.gmail) {
      this.listeners.push(handler);
      // Start polling if not already running
      if (!this.pollTimer) {
        this.startPolling();
      }
    } else {
      this.pendingListeners.push(handler);
    }
  }

  async send(email: RenderedEmail): Promise<string> {
    if (!this.connected || !this.gmail) {
      throw new ChannelSendError("email", "Cannot send: not connected");
    }

    const raw = this.buildRawRfc5322(email);

    const result = await this.withRateLimitRetry(async () => {
      return this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: Buffer.from(raw).toString("base64url"),
        },
      });
    });

    return result.data?.id ?? "";
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Private — Polling
  // -----------------------------------------------------------------------

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollNewMessages();
    }, this.config.pollingInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollNewMessages(): Promise<void> {
    if (!this.gmail || !this.lastHistoryId) return;

    try {
      const historyResponse = await this.gmail.users.history.list({
        userId: "me",
        startHistoryId: this.lastHistoryId,
        historyTypes: ["messageAdded"],
      });

      const history = historyResponse.data?.history ?? [];
      const newHistoryId = historyResponse.data?.historyId;

      if (newHistoryId) {
        this.lastHistoryId = newHistoryId;
      }

      // Process new messages
      for (const entry of history) {
        const addedMessages = entry.messagesAdded ?? [];
        for (const added of addedMessages) {
          const messageId = added.message?.id;
          if (messageId) {
            await this.fetchAndNotify(messageId);
          }
        }
      }
    } catch (error) {
      console.error(
        `[email/gmail] Poll error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async fetchAndNotify(gmailMessageId: string): Promise<void> {
    if (!this.gmail) return;

    try {
      const msgResponse = await this.gmail.users.messages.get({
        userId: "me",
        id: gmailMessageId,
        format: "full",
      });

      const rawEmail = this.parseGmailMessage(msgResponse.data);
      if (rawEmail) {
        for (const handler of this.listeners) {
          handler(rawEmail);
        }
      }
    } catch (error) {
      console.error(
        `[email/gmail] Fetch error for ${gmailMessageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private — Gmail message parsing
  // -----------------------------------------------------------------------

  // biome-ignore lint/suspicious/noExplicitAny: Gmail API response type
  private parseGmailMessage(data: any): RawEmail | undefined {
    if (!data?.payload) return undefined;

    const headers = new Map<string, string>();
    for (const header of data.payload.headers ?? []) {
      if (header.name && header.value) {
        headers.set(header.name.toLowerCase(), header.value);
      }
    }

    const from = parseEmailAddressString(headers.get("from") ?? "");
    const messageId = headers.get("message-id") ?? data.id;
    if (!from) return undefined;

    const to = (headers.get("to") ?? "")
      .split(",")
      .map((s: string) => parseEmailAddressString(s.trim()))
      .filter((a: EmailAddress | undefined): a is EmailAddress => a !== undefined);

    const cc = headers.get("cc")
      ? headers
          .get("cc")
          ?.split(",")
          .map((s: string) => parseEmailAddressString(s.trim()))
          .filter((a: EmailAddress | undefined): a is EmailAddress => a !== undefined)
      : undefined;

    const dateStr = headers.get("date");
    const date = dateStr ? new Date(dateStr) : new Date();

    const inReplyTo = headers.get("in-reply-to") ?? undefined;
    const referencesStr = headers.get("references");
    const references = referencesStr
      ? referencesStr.split(/\s+/).filter((r) => r.length > 0)
      : undefined;

    // Extract body
    const { textBody, htmlBody } = this.extractBody(data.payload);

    return {
      messageId,
      from,
      to,
      ...(cc ? { cc } : {}),
      subject: headers.get("subject") ?? "",
      date,
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
      ...(textBody !== undefined ? { textBody } : {}),
      ...(htmlBody !== undefined ? { htmlBody } : {}),
      attachments: [],
      headers,
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: Gmail payload structure
  private extractBody(payload: any): { textBody?: string; htmlBody?: string } {
    let textBody: string | undefined;
    let htmlBody: string | undefined;

    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
      if (payload.mimeType === "text/plain") {
        textBody = decoded;
      } else if (payload.mimeType === "text/html") {
        htmlBody = decoded;
      }
    }

    // Check parts for multipart
    if (payload.parts) {
      for (const part of payload.parts) {
        const partBody = this.extractBody(part);
        if (partBody.textBody && !textBody) textBody = partBody.textBody;
        if (partBody.htmlBody && !htmlBody) htmlBody = partBody.htmlBody;
      }
    }

    return {
      ...(textBody !== undefined ? { textBody } : {}),
      ...(htmlBody !== undefined ? { htmlBody } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Private — RFC 5322 encoding for sending
  // -----------------------------------------------------------------------

  private buildRawRfc5322(email: RenderedEmail): string {
    const lines: string[] = [];
    lines.push(`From: ${email.from}`);
    lines.push(`To: ${email.to}`);
    if (email.cc) lines.push(`Cc: ${email.cc}`);
    if (email.bcc) lines.push(`Bcc: ${email.bcc}`);
    lines.push(`Subject: ${email.subject}`);
    if (email.inReplyTo) lines.push(`In-Reply-To: ${email.inReplyTo}`);
    if (email.references) lines.push(`References: ${email.references}`);
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("");
    lines.push(email.html ?? email.text ?? "");

    return lines.join("\r\n");
  }

  // -----------------------------------------------------------------------
  // Private — Rate limit retry
  // -----------------------------------------------------------------------

  private async withRateLimitRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.withRateLimitRetry(fn, attempt + 1);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an email address string like "Name <email@example.com>" or "email@example.com"
 */
function parseEmailAddressString(str: string): EmailAddress | undefined {
  if (!str || str.trim().length === 0) return undefined;

  const angleMatch = /^(.+?)\s*<([^>]+)>$/.exec(str.trim());
  if (angleMatch?.[2]) {
    const rawName = angleMatch[1]?.replace(/^["']|["']$/g, "").trim();
    return {
      ...(rawName ? { name: rawName } : {}),
      address: angleMatch[2].trim(),
    };
  }

  // Plain address
  const trimmed = str.trim();
  if (trimmed.includes("@")) {
    return { address: trimmed };
  }

  return undefined;
}
