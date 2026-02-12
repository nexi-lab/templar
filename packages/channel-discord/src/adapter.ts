import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
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
// Lazy loader (Decision 15A)
// ---------------------------------------------------------------------------

/**
 * Lazily load the Discord Client class to keep it as a runtime-only dependency.
 */
async function loadDiscordClient(): Promise<DiscordClientConstructor> {
  try {
    const mod = await import("discord.js");
    return mod.Client as unknown as DiscordClientConstructor;
  } catch (error) {
    throw new ChannelLoadError(
      "discord",
      `Failed to load discord.js: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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

/**
 * Discord channel adapter using discord.js v14.
 *
 * Implements the ChannelAdapter interface with:
 * - Config-driven Gateway connection with tiered defaults
 * - Lazy-loaded discord.js Client
 * - Production-safe sweeper defaults for memory management
 * - Batched message rendering (content + files + components)
 * - Explicit error handling for common Discord failures
 */
export class DiscordChannel implements ChannelAdapter {
  readonly name = "discord" as const;
  readonly capabilities: ChannelCapabilities = DISCORD_CAPABILITIES;

  private readonly config: DiscordConfig;
  private client: DiscordClient | undefined;
  private connected = false;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    this.config = parseDiscordConfig(rawConfig);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

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
      this.connected = true;
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "discord",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.client) return;

    this.client.destroy();
    this.client = undefined;
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected || !this.client) {
      throw new ChannelSendError(
        "discord",
        "Cannot send message: adapter not connected. Call connect() first.",
      );
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

  onMessage(handler: MessageHandler): void {
    if (!this.client) {
      throw new ChannelLoadError("discord", "Cannot register handler: call connect() first.");
    }

    this.client.on("messageCreate", async (msg: never) => {
      try {
        const inbound = normalizeMessage(msg);
        if (inbound) {
          await handler(inbound);
        }
      } catch (error) {
        console.error(
          "[DiscordChannel] Error handling message:",
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    this.client.on("error", (error: never) => {
      console.error(
        "[DiscordChannel] Client error:",
        (error as unknown as Error).message ?? String(error),
      );
    });
  }

  /**
   * Get the underlying discord.js Client instance.
   * Useful for registering slash commands, interaction handlers,
   * or accessing advanced Discord features beyond the adapter interface.
   */
  getClient(): DiscordClient | undefined {
    return this.client;
  }
}
