import { ChannelSendError } from "@templar/errors";

// ---------------------------------------------------------------------------
// Minimal Discord.js types (injectable for testing)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a Discord webhook that can send messages.
 */
export interface WebhookSendable {
  send(options: Record<string, unknown>): Promise<unknown>;
}

/**
 * Extended webhook info returned by Discord API (fetchWebhooks / createWebhook).
 */
export interface DiscordWebhookInfo extends WebhookSendable {
  readonly id: string;
  readonly token: string | null;
  readonly owner: { readonly id: string } | null;
  readonly name: string | null;
}

/**
 * Injectable dependencies for WebhookManager.
 * Keeps the manager testable without requiring a real Discord client.
 */
export interface WebhookManagerDeps {
  readonly fetchWebhooks: (channelId: string) => Promise<readonly DiscordWebhookInfo[]>;
  readonly createWebhook: (channelId: string, name: string) => Promise<DiscordWebhookInfo>;
  readonly botUserId: string;
}

// ---------------------------------------------------------------------------
// Discord error code constants (shared by renderer + webhook-manager)
// ---------------------------------------------------------------------------

/** Webhook no longer exists (deleted by admin) */
export const DISCORD_ERROR_UNKNOWN_WEBHOOK = 10015;

/** Maximum number of webhooks reached (15 per channel) */
export const DISCORD_ERROR_MAX_WEBHOOKS = 30007;

/** Bot lacks required permission */
export const DISCORD_ERROR_MISSING_PERMISSIONS = 50013;

/** Bot cannot access the resource */
export const DISCORD_ERROR_MISSING_ACCESS = 50001;

// ---------------------------------------------------------------------------
// Username sanitization
// ---------------------------------------------------------------------------

const FORBIDDEN_SUBSTRINGS = [/clyde/gi, /discord/gi];
const MAX_USERNAME_LENGTH = 80;
const FALLBACK_USERNAME = "Agent";

/**
 * Sanitize a webhook username per Discord constraints:
 * - Must not contain "clyde" or "discord" (case-insensitive)
 * - Must be 1-80 characters
 * - Falls back to "Agent" if empty after sanitization
 */
export function sanitizeWebhookUsername(name: string): string {
  let sanitized = name;
  for (const pattern of FORBIDDEN_SUBSTRINGS) {
    sanitized = sanitized.replace(pattern, "");
  }
  sanitized = sanitized.trim();

  if (sanitized.length === 0) {
    return FALLBACK_USERNAME;
  }

  if (sanitized.length > MAX_USERNAME_LENGTH) {
    return sanitized.slice(0, MAX_USERNAME_LENGTH);
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// WebhookManager
// ---------------------------------------------------------------------------

/**
 * Manages Discord webhooks for per-message identity.
 *
 * - Auto-creates webhooks per channel via MANAGE_WEBHOOKS permission
 * - Caches webhooks in a Map for fast repeated sends
 * - Deduplicates concurrent creates for the same channel (promise coalescing)
 * - Sanitizes webhook usernames per Discord constraints
 */
export class WebhookManager {
  private readonly cache = new Map<string, DiscordWebhookInfo>();
  private readonly pending = new Map<string, Promise<DiscordWebhookInfo>>();
  private readonly deps: WebhookManagerDeps;
  private readonly webhookName: string;

  constructor(deps: WebhookManagerDeps, webhookName?: string) {
    this.deps = deps;
    this.webhookName = webhookName ?? "Templar";
  }

  /**
   * Get or create a webhook for a channel. Returns a cached webhook
   * on subsequent calls. Deduplicates concurrent creates.
   */
  async getOrCreate(channelId: string): Promise<WebhookSendable> {
    // 1. Cache hit
    const cached = this.cache.get(channelId);
    if (cached) return cached;

    // 2. Dedup: await in-flight creation for same channel
    const inflight = this.pending.get(channelId);
    if (inflight) return inflight;

    // 3. Create and cache
    const promise = this.findOrCreate(channelId);
    this.pending.set(channelId, promise);

    try {
      const webhook = await promise;
      this.cache.set(channelId, webhook);
      return webhook;
    } finally {
      this.pending.delete(channelId);
    }
  }

  /**
   * Invalidate a cached webhook for a specific channel.
   * Called when a 10015 Unknown Webhook error is received.
   */
  invalidate(channelId: string): void {
    this.cache.delete(channelId);
  }

  /**
   * Clear all cached webhooks. Called on disconnect().
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async findOrCreate(channelId: string): Promise<DiscordWebhookInfo> {
    // Try to find an existing webhook owned by this bot
    const existing = await this.fetchOwnedWebhook(channelId);
    if (existing) return existing;

    // Create a new webhook
    return this.createNewWebhook(channelId);
  }

  private async fetchOwnedWebhook(channelId: string): Promise<DiscordWebhookInfo | undefined> {
    try {
      const webhooks = await this.deps.fetchWebhooks(channelId);
      return webhooks.find((wh) => wh.owner?.id === this.deps.botUserId && wh.token !== null);
    } catch (error) {
      throw this.mapWebhookError(error, channelId, "fetch webhooks");
    }
  }

  private async createNewWebhook(channelId: string): Promise<DiscordWebhookInfo> {
    try {
      return await this.deps.createWebhook(channelId, this.webhookName);
    } catch (error) {
      throw this.mapWebhookError(error, channelId, "create webhook");
    }
  }

  private mapWebhookError(error: unknown, channelId: string, operation: string): ChannelSendError {
    if (error instanceof ChannelSendError) return error;

    const code = (error as Record<string, unknown> | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    if (code === DISCORD_ERROR_UNKNOWN_WEBHOOK) {
      return new ChannelSendError(
        "discord",
        `Webhook for channel ${channelId} no longer exists (deleted). Will retry with a new webhook.`,
        { cause },
      );
    }

    if (code === DISCORD_ERROR_MAX_WEBHOOKS) {
      return new ChannelSendError(
        "discord",
        `Channel ${channelId} has reached the maximum webhook limit (15). Identity will not be applied.`,
        { cause },
      );
    }

    if (code === DISCORD_ERROR_MISSING_PERMISSIONS) {
      return new ChannelSendError(
        "discord",
        `Bot lacks MANAGE_WEBHOOKS permission in channel ${channelId}. Cannot ${operation} for identity. Grant the permission or identity will not be applied.`,
        { cause },
      );
    }

    return new ChannelSendError(
      "discord",
      `Failed to ${operation} for channel ${channelId}: ${message}`,
      { cause },
    );
  }
}
