import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, ChannelSendError } from "@templar/errors";

import { DISCORD_CAPABILITIES } from "./capabilities.js";
import { type DiscordConfig, type IntentName, parseDiscordConfig } from "./config.js";
import { normalizeMessage } from "./normalizer.js";
import { type DiscordSendable, renderMessage } from "./renderer.js";

// ---------------------------------------------------------------------------
// Minimal discord.js types (avoid hard coupling to discord.js imports)
// ---------------------------------------------------------------------------

interface DiscordClient {
  login(token: string): Promise<string>;
  destroy(): void;
  on(event: string, handler: (...args: never[]) => void): void;
  channels: {
    fetch(id: string): Promise<DiscordSendable | null>;
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
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "discord",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (!this.client) return;
    this.client.destroy();
    this.client = undefined;
  }

  protected override async doSend(message: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new ChannelSendError("discord", "Client not initialized");
    }

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
}
