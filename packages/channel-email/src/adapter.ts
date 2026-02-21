import { BaseChannelAdapter } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError } from "@templar/errors";
import { EMAIL_CAPABILITIES } from "./capabilities.js";
import { type EmailConfig, parseEmailConfig } from "./config.js";
import { normalizeEmail } from "./normalizer.js";
import { GmailProvider } from "./providers/gmail.js";
import { ImapSmtpProvider } from "./providers/imap-smtp.js";
import type { EmailProvider, RawEmail } from "./providers/types.js";
import { buildEmailFromMessage } from "./renderer.js";
import { ThreadCache } from "./thread-cache.js";

/**
 * Email channel adapter supporting Gmail API and IMAP/SMTP.
 *
 * Uses a strategy pattern: the `provider` config field selects between
 * `GmailProvider` (Gmail API) and `ImapSmtpProvider` (IMAP IDLE + SMTP pool).
 *
 * Both providers convert to the shared `RawEmail` intermediate format,
 * which the normalizer converts to `InboundMessage`.
 *
 * @example
 * ```typescript
 * const email = new EmailChannel({
 *   provider: "imap-smtp",
 *   imap: { host: "imap.gmail.com", port: 993, secure: true, auth: { user: "...", pass: "..." } },
 *   smtp: { host: "smtp.gmail.com", port: 587, secure: false, auth: { user: "...", pass: "..." } },
 * });
 * await email.connect();
 * email.onMessage((msg) => console.log("New email:", msg));
 * ```
 */
export class EmailChannel extends BaseChannelAdapter<RawEmail, EmailProvider> {
  private readonly emailConfig: EmailConfig;
  private provider: EmailProvider | undefined;
  private pendingEmailListeners: Array<(raw: RawEmail) => void> = [];

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseEmailConfig(rawConfig);
    const threadCache = new ThreadCache();

    super({
      name: "email",
      capabilities: EMAIL_CAPABILITIES,
      normalizer: (raw: RawEmail) => normalizeEmail(raw, threadCache),
      renderer: async (message: OutboundMessage, provider: EmailProvider) => {
        const fromAddress = config.provider === "gmail" ? config.user : config.smtp.auth.user;
        const email = buildEmailFromMessage(message, threadCache, fromAddress);
        await provider.send(email);
      },
    });

    this.emailConfig = config;
  }

  protected async doConnect(): Promise<void> {
    this.provider = this.createProvider();
    await this.provider.connect();

    // Wire pending listeners from registerListener calls before connect
    for (const callback of this.pendingEmailListeners) {
      this.provider.listen(callback);
    }
    this.pendingEmailListeners = [];
  }

  protected async doDisconnect(): Promise<void> {
    if (this.provider) {
      await this.provider.disconnect();
      this.provider = undefined;
    }
  }

  protected registerListener(callback: (raw: RawEmail) => void): void {
    if (this.provider) {
      this.provider.listen(callback);
    } else {
      this.pendingEmailListeners.push(callback);
    }
  }

  protected getClient(): EmailProvider {
    if (!this.provider) {
      throw new ChannelLoadError("email", "Provider not initialized");
    }
    return this.provider;
  }

  /** Get the underlying provider type */
  get providerType(): "gmail" | "imap-smtp" {
    return this.emailConfig.provider;
  }

  private createProvider(): EmailProvider {
    if (this.emailConfig.provider === "gmail") {
      return new GmailProvider(this.emailConfig);
    }
    return new ImapSmtpProvider(this.emailConfig);
  }
}
