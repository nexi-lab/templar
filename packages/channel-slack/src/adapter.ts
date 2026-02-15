import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError } from "@templar/errors";

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

// ---------------------------------------------------------------------------
// Lazy loader (Decision 16A)
// ---------------------------------------------------------------------------

const loadBoltApp = lazyLoad<BoltAppConstructor>(
  "slack",
  "@slack/bolt",
  (mod) => (mod as { App: BoltAppConstructor }).App,
);

/**
 * Slack channel adapter using Bolt (Socket Mode).
 *
 * Extends BaseChannelAdapter with:
 * - Config-driven Socket Mode connection
 * - Lazy-loaded Bolt SDK
 * - Block Kit batch rendering
 * - Slack event normalization
 */
export class SlackChannel extends BaseChannelAdapter<SlackMessageEvent, SlackWebClient> {
  private readonly config: SlackConfig;
  private app: BoltApp | undefined;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseSlackConfig(rawConfig);
    super({
      name: "slack",
      capabilities: SLACK_CAPABILITIES,
      normalizer: (event: SlackMessageEvent) => normalizeSlackEvent(event),
      renderer: (message: OutboundMessage, client: SlackWebClient) =>
        renderMessage(message, client),
    });
    this.config = config;
  }

  protected async doConnect(): Promise<void> {
    try {
      const AppClass = await loadBoltApp();
      this.app = new AppClass({
        token: this.config.token,
        appToken: this.config.appToken,
        socketMode: true,
      });
      await this.app.start();
    } catch (error) {
      if (error instanceof ChannelLoadError) throw error;
      throw new ChannelLoadError(
        "slack",
        `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (!this.app) return;
    await this.app.stop();
    this.app = undefined;
  }

  protected registerListener(callback: (raw: SlackMessageEvent) => void): void {
    if (!this.app) {
      throw new ChannelLoadError("slack", "Cannot register handler: call connect() first.");
    }

    this.app.message(async ({ message }) => {
      callback(message);
    });

    this.app.error(async ({ error }) => {
      console.error("[SlackChannel] Unhandled error:", error.message);
    });
  }

  protected getClient(): SlackWebClient {
    if (!this.app) {
      throw new ChannelLoadError("slack", "App not initialized");
    }
    return this.app.client;
  }

  /**
   * Get the underlying Bolt App instance.
   * Useful for registering additional event handlers or middleware.
   */
  getApp(): BoltApp | undefined {
    return this.app;
  }
}
