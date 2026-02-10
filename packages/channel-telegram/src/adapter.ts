import { autoRetry } from "@grammyjs/auto-retry";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { ChannelLoadError } from "@templar/errors";
import { Bot } from "grammy";

import { TELEGRAM_CAPABILITIES } from "./capabilities.js";
import { parseTelegramConfig, type TelegramConfig } from "./config.js";
import { normalizeUpdate } from "./normalizer.js";
import { renderMessage } from "./renderer.js";

/**
 * Telegram channel adapter using grammY.
 *
 * Implements the ChannelAdapter interface with:
 * - Config-driven dual mode (polling / webhook)
 * - Automatic 429 retry via @grammyjs/auto-retry
 * - Entity-aware message normalization
 * - Sequential block rendering with text coalescing
 */
export class TelegramChannel implements ChannelAdapter {
  readonly name = "telegram" as const;
  readonly capabilities: ChannelCapabilities = TELEGRAM_CAPABILITIES;

  private readonly config: TelegramConfig;
  private readonly bot: Bot;
  private connected = false;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    this.config = parseTelegramConfig(rawConfig);
    this.bot = new Bot(this.config.token);
    this.bot.api.config.use(autoRetry());
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.bot.init();
    } catch (error) {
      throw new ChannelLoadError(
        "telegram",
        `Failed to initialize bot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (this.config.mode === "polling") {
      // bot.start() runs in the background; it resolves after starting to poll
      this.bot.start({
        onStart: () => {
          /* polling started */
        },
      });
      this.connected = true;
    } else {
      try {
        const webhookOpts: Record<string, unknown> = {};
        if (this.config.secretToken) {
          webhookOpts.secret_token = this.config.secretToken;
        }
        await this.bot.api.setWebhook(this.config.webhookUrl, webhookOpts);
        this.connected = true;
      } catch (error) {
        throw new ChannelLoadError(
          "telegram",
          `Failed to set webhook: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    if (this.config.mode === "polling") {
      await this.bot.stop();
    } else {
      await this.bot.api.deleteWebhook();
    }
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected) {
      throw new ChannelLoadError(
        "telegram",
        "Cannot send message: adapter not connected. Call connect() first.",
      );
    }
    await renderMessage(message, this.bot.api);
  }

  onMessage(handler: MessageHandler): void {
    const botUsername = this.bot.botInfo?.username ?? "";
    const token = this.config.token;

    this.bot.on("message", async (ctx) => {
      try {
        const inbound = await normalizeUpdate(ctx.update, this.bot.api, token, botUsername);
        if (inbound) {
          await handler(inbound);
        }
      } catch (error) {
        console.error(
          `[TelegramChannel] Error handling update ${ctx.update.update_id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    this.bot.catch((err) => {
      console.error("[TelegramChannel] Unhandled error:", err.message);
    });
  }

  /**
   * Get the underlying grammY Bot instance.
   * Useful for webhook integration where the caller mounts the webhook handler.
   */
  getBot(): Bot {
    return this.bot;
  }
}
