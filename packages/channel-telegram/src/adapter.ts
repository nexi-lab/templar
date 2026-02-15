import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError } from "@templar/errors";
import type { Api, Bot } from "grammy";
import type { Update } from "grammy/types";

import { TELEGRAM_CAPABILITIES } from "./capabilities.js";
import { parseTelegramConfig, type TelegramConfig } from "./config.js";
import { normalizeUpdate } from "./normalizer.js";
import { renderMessage } from "./renderer.js";

// ---------------------------------------------------------------------------
// Lazy loaders (Decision 16A)
// ---------------------------------------------------------------------------

const loadGrammy = lazyLoad("telegram", "grammy", (mod) => (mod as { Bot: typeof Bot }).Bot);

type AutoRetryFn = () => Parameters<Api["config"]["use"]>[0];

const loadAutoRetry = lazyLoad<AutoRetryFn>(
  "telegram",
  "@grammyjs/auto-retry",
  (mod) => (mod as { autoRetry: AutoRetryFn }).autoRetry,
);

/**
 * Telegram channel adapter using grammY.
 *
 * Extends BaseChannelAdapter with:
 * - Config-driven dual mode (polling / webhook)
 * - Lazy-loaded grammY + auto-retry
 * - Entity-aware message normalization
 * - Sequential block rendering with text coalescing
 */
export class TelegramChannel extends BaseChannelAdapter<Update, Api> {
  private readonly config: TelegramConfig;
  private bot: Bot | undefined;
  private pendingListeners: Array<(raw: Update) => void> = [];

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseTelegramConfig(rawConfig);
    super({
      name: "telegram",
      capabilities: TELEGRAM_CAPABILITIES,
      normalizer: async (update: Update) => {
        if (!this.bot) return undefined;
        const botUsername = this.bot.botInfo?.username ?? "";
        return normalizeUpdate(update, this.bot.api, config.token, botUsername);
      },
      renderer: (message: OutboundMessage, api: Api) => renderMessage(message, api),
    });
    this.config = config;
  }

  protected async doConnect(): Promise<void> {
    try {
      const BotClass = await loadGrammy();
      const autoRetry = await loadAutoRetry();
      this.bot = new BotClass(this.config.token);
      this.bot.api.config.use(autoRetry());
      await this.bot.init();
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "telegram",
        `Failed to initialize bot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Wire any listeners registered before connect
    for (const callback of this.pendingListeners) {
      this.wireListener(callback);
    }
    this.pendingListeners = [];

    if (this.config.mode === "polling") {
      this.bot.start({
        onStart: () => {
          /* polling started */
        },
      });
    } else {
      try {
        const webhookOpts: Record<string, unknown> = {};
        if (this.config.secretToken) {
          webhookOpts.secret_token = this.config.secretToken;
        }
        await this.bot.api.setWebhook(this.config.webhookUrl, webhookOpts);
      } catch (error) {
        throw new ChannelLoadError(
          "telegram",
          `Failed to set webhook: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (!this.bot) return;

    if (this.config.mode === "polling") {
      await this.bot.stop();
    } else {
      await this.bot.api.deleteWebhook();
    }
    this.bot = undefined;
  }

  protected registerListener(callback: (raw: Update) => void): void {
    if (this.bot) {
      this.wireListener(callback);
    } else {
      this.pendingListeners.push(callback);
    }
  }

  protected getClient(): Api {
    if (!this.bot) {
      throw new ChannelLoadError("telegram", "Bot not initialized");
    }
    return this.bot.api;
  }

  /**
   * Get the underlying grammY Bot instance.
   * Useful for webhook integration where the caller mounts the webhook handler.
   */
  getBot(): Bot | undefined {
    return this.bot;
  }

  private wireListener(callback: (raw: Update) => void): void {
    if (!this.bot) return;

    this.bot.on("message", (ctx) => {
      callback(ctx.update);
    });

    this.bot.catch((err) => {
      console.error("[TelegramChannel] Unhandled error:", err.message);
    });
  }
}
