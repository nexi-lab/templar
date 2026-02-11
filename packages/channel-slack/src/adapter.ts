import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { ChannelLoadError, ChannelSendError } from "@templar/errors";

import { SLACK_CAPABILITIES } from "./capabilities.js";
import { parseSlackConfig, type SlackConfig } from "./config.js";
import { normalizeSlackEvent, type SlackMessageEvent } from "./normalizer.js";
import { renderMessage, type SlackWebClient } from "./renderer.js";

// ---------------------------------------------------------------------------
// Minimal Bolt App interface (avoid hard coupling to @slack/bolt types)
// ---------------------------------------------------------------------------

interface BoltApp {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  client: SlackWebClient;
  message(
    handler: (args: {
      message: SlackMessageEvent;
      say: unknown;
      client: SlackWebClient;
    }) => Promise<void>,
  ): void;
  error(handler: (args: { error: Error }) => Promise<void>): void;
}

type BoltAppConstructor = new (opts: {
  token: string;
  appToken: string;
  socketMode: boolean;
}) => BoltApp;

/**
 * Lazily load the Bolt App class to keep it as a runtime-only dependency.
 */
async function loadBoltApp(): Promise<BoltAppConstructor> {
  try {
    const mod = await import("@slack/bolt");
    return mod.App as unknown as BoltAppConstructor;
  } catch (error) {
    throw new ChannelLoadError(
      "slack",
      `Failed to load @slack/bolt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Slack channel adapter using Bolt (Socket Mode).
 *
 * Implements the ChannelAdapter interface with:
 * - Config-driven Socket Mode connection
 * - Bolt SDK rate-limit handling
 * - Block Kit batch rendering
 * - Slack event normalization
 */
export class SlackChannel implements ChannelAdapter {
  readonly name = "slack" as const;
  readonly capabilities: ChannelCapabilities = SLACK_CAPABILITIES;

  private readonly config: SlackConfig;
  private app: BoltApp | undefined;
  private connected = false;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    this.config = parseSlackConfig(rawConfig);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const AppClass = await loadBoltApp();
      this.app = new AppClass({
        token: this.config.token,
        appToken: this.config.appToken,
        socketMode: true,
      });
      await this.app.start();
      this.connected = true;
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "slack",
        `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.app) return;

    await this.app.stop();
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected || !this.app) {
      throw new ChannelSendError(
        "slack",
        "Cannot send message: adapter not connected. Call connect() first.",
      );
    }
    await renderMessage(message, this.app.client);
  }

  onMessage(handler: MessageHandler): void {
    if (!this.app) {
      throw new ChannelLoadError("slack", "Cannot register handler: call connect() first.");
    }

    this.app.message(async ({ message }) => {
      try {
        const inbound = normalizeSlackEvent(message);
        if (inbound) {
          await handler(inbound);
        }
      } catch (error) {
        console.error(
          "[SlackChannel] Error handling message:",
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    this.app.error(async ({ error }) => {
      console.error("[SlackChannel] Unhandled error:", error.message);
    });
  }

  /**
   * Get the underlying Bolt App instance.
   * Useful for registering additional event handlers or middleware.
   */
  getApp(): BoltApp | undefined {
    return this.app;
  }
}
