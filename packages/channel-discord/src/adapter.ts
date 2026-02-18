import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, ChannelSendError } from "@templar/errors";

import { DISCORD_CAPABILITIES } from "./capabilities.js";
import { type DiscordConfig, type IntentName, parseDiscordConfig } from "./config.js";
import { normalizeMessage } from "./normalizer.js";
import { type DiscordSendable, renderMessage, renderWebhookMessage } from "./renderer.js";
import { type DiscordWebhookInfo, WebhookManager } from "./webhook-manager.js";

// ---------------------------------------------------------------------------
// Minimal discord.js types (avoid hard coupling to discord.js imports)
// ---------------------------------------------------------------------------

interface DiscordTextChannel extends DiscordSendable {
  fetchWebhooks(): Promise<ReadonlyMap<string, DiscordWebhookInfo>>;
  createWebhook(options: { name: string }): Promise<DiscordWebhookInfo>;
}

interface DiscordClient {
  login(token: string): Promise<string>;
  destroy(): void;
  on(event: string, handler: (...args: never[]) => void): void;
  channels: {
    fetch(id: string): Promise<(DiscordSendable & Partial<DiscordTextChannel>) | null>;
  };
  user: { id: string } | null;
}

type DiscordClientConstructor = new (opts: Record<string, unknown>) => DiscordClient;

// ---------------------------------------------------------------------------
// Intent name → GatewayIntentBits resolution
// ---------------------------------------------------------------------------

async function resolveIntents(names: readonly IntentName[]): Promise<number[]> {
  const { GatewayIntentBits } = await import("discord.js");
  return names.map((name) => {
    const value = GatewayIntentBits[name as keyof typeof GatewayIntentBits];
    if (value === undefined) {
      throw new ChannelLoadError("discord", `Unknown intent: ${name}`);
    }
    return value as number;
  });
}

// ---------------------------------------------------------------------------
// Lazy loader (Decision 16A)
// ---------------------------------------------------------------------------

const loadDiscordClient = lazyLoad<DiscordClientConstructor>(
  "discord",
  "discord.js",
  (mod) => (mod as { Client: DiscordClientConstructor }).Client,
);

// ---------------------------------------------------------------------------
// Sweeper config builder
// ---------------------------------------------------------------------------

function buildSweeperOptions(
  config: DiscordConfig["sweepers"],
): Record<string, unknown> | undefined {
  if (!config.messages && !config.threads && !config.users) return undefined;

  const sweepers: Record<string, unknown> = {};

  if (config.messages) {
    sweepers.messages = {
      interval: config.messages.interval,
      lifetime: config.messages.lifetime,
    };
  }

  if (config.threads) {
    sweepers.threads = {
      interval: config.threads.interval,
      lifetime: config.threads.lifetime,
    };
  }

  if (config.users) {
    sweepers.users = {
      interval: config.users.interval,
      filter:
        () => (user: { bot: boolean; id: string }, _: unknown, client: { user?: { id: string } }) =>
          user.bot && user.id !== client.user?.id,
    };
  }

  return sweepers;
}

// ---------------------------------------------------------------------------
// Discord API error code extraction
// ---------------------------------------------------------------------------

/**
 * Extract the numeric Discord API error code from an error or its cause chain.
 * ChannelSendError.code is the Templar catalog code (string like "CHANNEL_SEND_ERROR"),
 * so we check the cause chain for the numeric Discord API code.
 */
function extractDiscordErrorCode(error: unknown): number | undefined {
  // Direct numeric code (raw Discord error, not wrapped)
  const directCode = (error as Record<string, unknown> | null)?.code;
  if (typeof directCode === "number") return directCode;

  // Check cause chain (ChannelSendError wraps the original Discord error as cause)
  const cause = (error as { cause?: unknown })?.cause;
  if (cause) {
    const causeCode = (cause as Record<string, unknown>)?.code;
    if (typeof causeCode === "number") return causeCode;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// DiscordChannel adapter
// ---------------------------------------------------------------------------

// Discord message type used as raw inbound event
type DiscordMessage = never;

/**
 * Discord channel adapter using discord.js v14.
 *
 * Extends BaseChannelAdapter with:
 * - Config-driven Gateway connection with tiered defaults
 * - Lazy-loaded discord.js Client
 * - Production-safe sweeper defaults for memory management
 * - Batched message rendering (content + files + components)
 * - Explicit error handling for common Discord failures
 */
export class DiscordChannel extends BaseChannelAdapter<DiscordMessage, DiscordSendable> {
  private readonly config: DiscordConfig;
  private client: DiscordClient | undefined;
  private webhookManager: WebhookManager | undefined;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseDiscordConfig(rawConfig);
    super({
      name: "discord",
      capabilities: DISCORD_CAPABILITIES,
      normalizer: (msg: DiscordMessage) => normalizeMessage(msg),
      renderer: (message: OutboundMessage, sendable: DiscordSendable) =>
        renderMessage(message, sendable),
    });
    this.config = config;
  }

  protected async doConnect(): Promise<void> {
    try {
      const ClientClass = await loadDiscordClient();
      const intents = await resolveIntents(this.config.intents);
      const sweepers = buildSweeperOptions(this.config.sweepers);

      this.client = new ClientClass({
        intents,
        ...(sweepers ? { sweepers } : {}),
        ...(this.config.presence ? { presence: this.config.presence } : {}),
      });

      await this.client.login(this.config.token);

      // Initialize WebhookManager for identity-aware sends
      if (this.client.user) {
        this.webhookManager = this.createWebhookManager(this.client);
      }
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "discord",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (this.webhookManager) {
      this.webhookManager.clear();
      this.webhookManager = undefined;
    }
    if (!this.client) return;
    this.client.destroy();
    this.client = undefined;
  }

  protected override async doSend(message: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new ChannelSendError("discord", "Client not initialized");
    }

    // Identity-triggered webhook path (Decision #1A)
    if (message.identity && this.webhookManager) {
      const sent = await this.trySendViaWebhook(message);
      if (sent) return;
      // Fallback: continue to Gateway send below
    }

    // Gateway send path (default)
    const channel = await this.client.channels.fetch(message.channelId);
    if (!channel) {
      throw new ChannelSendError(
        "discord",
        `Channel ${message.channelId} not found or not accessible.`,
      );
    }

    await renderMessage(message, channel);
  }

  protected registerListener(callback: (raw: DiscordMessage) => void): void {
    if (!this.client) {
      throw new ChannelLoadError("discord", "Cannot register handler: call connect() first.");
    }

    this.client.on("messageCreate", async (msg: never) => {
      callback(msg);
    });

    this.client.on("error", (error: never) => {
      console.error(
        "[DiscordChannel] Client error:",
        (error as unknown as Error).message ?? String(error),
      );
    });
  }

  protected getClient(): DiscordSendable {
    throw new ChannelLoadError("discord", "Use doSend() override — getClient() not used directly");
  }

  /**
   * Get the underlying discord.js Client instance.
   * Useful for registering slash commands, interaction handlers,
   * or accessing advanced Discord features beyond the adapter interface.
   */
  getDiscordClient(): DiscordClient | undefined {
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Webhook identity helpers
  // -------------------------------------------------------------------------

  /**
   * Create a WebhookManager wired to the Discord client.
   * Protected for testing — subclasses can inject a mock manager.
   */
  protected createWebhookManager(client: DiscordClient): WebhookManager {
    const botUserId = client.user?.id ?? "";
    return new WebhookManager(
      {
        fetchWebhooks: async (channelId: string) => {
          const channel = await client.channels.fetch(channelId);
          if (!channel?.fetchWebhooks) return [];
          const webhooks = await channel.fetchWebhooks();
          return [...webhooks.values()];
        },
        createWebhook: async (channelId: string, name: string) => {
          const channel = await client.channels.fetch(channelId);
          if (!channel?.createWebhook) {
            throw new ChannelSendError(
              "discord",
              `Channel ${channelId} does not support webhooks.`,
            );
          }
          return channel.createWebhook({ name });
        },
        botUserId,
      },
      this.config.webhookName,
    );
  }

  /**
   * Attempt to send via webhook with identity. Returns true if successful,
   * false if the caller should fall back to Gateway send.
   */
  private async trySendViaWebhook(message: OutboundMessage): Promise<boolean> {
    if (!this.webhookManager) return false;

    try {
      const webhook = await this.webhookManager.getOrCreate(message.channelId);
      await renderWebhookMessage(message, webhook);
      return true;
    } catch (error) {
      // 10015 Unknown Webhook — invalidate cache and retry once.
      // ChannelSendError.code is the Templar error code (string), not the Discord
      // API code (number). Extract the numeric Discord code from the cause chain.
      const discordCode = extractDiscordErrorCode(error);

      if (discordCode === 10015) {
        this.webhookManager.invalidate(message.channelId);
        try {
          const webhook = await this.webhookManager.getOrCreate(message.channelId);
          await renderWebhookMessage(message, webhook);
          return true;
        } catch {
          // Retry failed — fall through to Gateway
        }
      }

      // 30007 (max webhooks) or permission errors — fall back to Gateway
      console.warn(
        `[DiscordChannel] Webhook send failed for channel ${message.channelId}, falling back to Gateway.`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
