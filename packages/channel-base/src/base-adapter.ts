import type {
  ChannelAdapter,
  ChannelCapabilities,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { ChannelSendError } from "@templar/errors";

/**
 * Options for constructing a BaseChannelAdapter.
 * Channel implementations provide their name, capabilities, and
 * normalizer/renderer as typed functions (not class inheritance).
 */
export interface BaseChannelAdapterOptions<TRaw, TClient> {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;
  readonly normalizer: (
    raw: TRaw,
  ) => InboundMessage | undefined | Promise<InboundMessage | undefined>;
  readonly renderer: (message: OutboundMessage, client: TClient) => Promise<void>;
}

/**
 * Abstract base class for channel adapters.
 *
 * Provides shared lifecycle management (connect/disconnect idempotency,
 * send guard, error-handled inbound normalization) so that concrete
 * adapters only implement the platform-specific hooks.
 *
 * @typeParam TRaw - The raw event type from the platform SDK
 * @typeParam TClient - The SDK client type used for rendering
 */
export abstract class BaseChannelAdapter<TRaw = unknown, TClient = unknown>
  implements ChannelAdapter
{
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  private connected = false;
  private readonly normalizer: BaseChannelAdapterOptions<TRaw, TClient>["normalizer"];
  private readonly renderer: BaseChannelAdapterOptions<TRaw, TClient>["renderer"];

  constructor(options: BaseChannelAdapterOptions<TRaw, TClient>) {
    this.name = options.name;
    this.capabilities = options.capabilities;
    this.normalizer = options.normalizer;
    this.renderer = options.renderer;
  }

  // --- Lifecycle (Template Method) ---

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.doConnect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.doDisconnect();
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected) {
      throw new ChannelSendError(
        this.name,
        "Cannot send message: adapter not connected. Call connect() first.",
      );
    }
    await this.doSend(message);
  }

  onMessage(handler: MessageHandler): void {
    this.registerListener((raw: TRaw) => {
      void this.handleInbound(raw, handler);
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * For subclasses that need to set connected state directly
   * (e.g., WhatsApp reconnection, event-driven connection updates).
   */
  protected setConnected(value: boolean): void {
    this.connected = value;
  }

  // --- Abstract hooks (channels implement these) ---

  /** Perform the actual connection (SDK login, socket open, etc.) */
  protected abstract doConnect(): Promise<void>;

  /** Perform the actual disconnection (SDK destroy, socket close, etc.) */
  protected abstract doDisconnect(): Promise<void>;

  /** Register a raw event listener on the underlying SDK client */
  protected abstract registerListener(callback: (raw: TRaw) => void): void;

  /** Get the underlying SDK client for rendering */
  protected abstract getClient(): TClient;

  // --- Overridable hooks ---

  /**
   * Execute a send operation. Default delegates to renderer + getClient().
   * Override for custom send logic (e.g., rate limiting queue).
   */
  protected async doSend(message: OutboundMessage): Promise<void> {
    await this.renderer(message, this.getClient());
  }

  // --- Private helpers ---

  private async handleInbound(raw: TRaw, handler: MessageHandler): Promise<void> {
    try {
      const inbound = await this.normalizer(raw);
      if (inbound) {
        await handler(inbound);
      }
    } catch (error) {
      console.error(
        `[${this.name}] Error handling message:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
