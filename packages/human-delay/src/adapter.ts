import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { HumanDelayConfigurationError } from "@templar/errors";
import { calculateDelay } from "./calculator.js";
import { type Clock, DEFAULT_CONFIG, type HumanDelayConfig, type ResolvedConfig } from "./types.js";

const DEFAULT_CLOCK: Clock = globalThis;

/** Resolve user config with defaults */
function resolveConfig(config?: HumanDelayConfig): ResolvedConfig {
  return {
    wpm: config?.wpm ?? DEFAULT_CONFIG.wpm,
    jitterFactor: config?.jitterFactor ?? DEFAULT_CONFIG.jitterFactor,
    minDelay: config?.minDelay ?? DEFAULT_CONFIG.minDelay,
    maxDelay: config?.maxDelay ?? DEFAULT_CONFIG.maxDelay,
    punctuationPause: config?.punctuationPause ?? DEFAULT_CONFIG.punctuationPause,
    typingRepeatMs: config?.typingRepeatMs ?? DEFAULT_CONFIG.typingRepeatMs,
    random: config?.random ?? Math.random,
    clock: config?.clock ?? DEFAULT_CLOCK,
  };
}

/** Validate configuration, throw HumanDelayConfigurationError on invalid input */
export function validateHumanDelayConfig(config?: HumanDelayConfig): void {
  if (config === undefined) return;

  if (config.wpm !== undefined && (config.wpm <= 0 || !Number.isFinite(config.wpm))) {
    throw new HumanDelayConfigurationError(`wpm must be > 0, got ${config.wpm}`);
  }
  if (config.jitterFactor !== undefined && (config.jitterFactor < 0 || config.jitterFactor > 1)) {
    throw new HumanDelayConfigurationError(`jitterFactor must be 0-1, got ${config.jitterFactor}`);
  }
  if (config.minDelay !== undefined && config.minDelay < 0) {
    throw new HumanDelayConfigurationError(`minDelay must be >= 0, got ${config.minDelay}`);
  }
  if (config.maxDelay !== undefined && config.maxDelay < 0) {
    throw new HumanDelayConfigurationError(`maxDelay must be >= 0, got ${config.maxDelay}`);
  }
  if (
    config.minDelay !== undefined &&
    config.maxDelay !== undefined &&
    config.minDelay > config.maxDelay
  ) {
    throw new HumanDelayConfigurationError(
      `minDelay (${config.minDelay}) > maxDelay (${config.maxDelay})`,
    );
  }
  if (config.typingRepeatMs !== undefined && config.typingRepeatMs < 100) {
    throw new HumanDelayConfigurationError(
      `typingRepeatMs must be >= 100, got ${config.typingRepeatMs}`,
    );
  }
}

/** Check if a message should be delayed */
function shouldDelay(message: OutboundMessage): boolean {
  if (message.metadata?.skipDelay === true) return false;
  return message.blocks.length > 0 && message.blocks.every((b) => b.type === "text");
}

/** Extract combined text from text blocks */
function extractText(message: OutboundMessage): string {
  return message.blocks
    .filter((b): b is { readonly type: "text"; readonly content: string } => b.type === "text")
    .map((b) => b.content)
    .join("\n");
}

/** Promise-based sleep using provided clock */
function sleep(ms: number, clock: Clock): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms);
  });
}

/** Whether inner adapter supports typing indicators */
function supportsTyping(adapter: ChannelAdapter): boolean {
  return adapter.capabilities.typingIndicator?.supported === true;
}

/**
 * Channel adapter decorator that adds human-like typing delays.
 *
 * - Sends typing indicator during delay (if channel supports it)
 * - Auto-repeats typing indicator to prevent expiry
 * - Bypasses delay for non-text messages and skipDelay metadata
 * - try/finally ensures timer cleanup on error
 */
export class HumanDelayAdapter implements ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  private readonly inner: ChannelAdapter;
  private readonly config: ResolvedConfig;

  constructor(inner: ChannelAdapter, config?: HumanDelayConfig) {
    this.inner = inner;
    this.name = inner.name;
    this.capabilities = inner.capabilities;
    this.config = resolveConfig(config);
  }

  async connect(): Promise<void> {
    await this.inner.connect();
  }

  async disconnect(): Promise<void> {
    await this.inner.disconnect();
  }

  onMessage(handler: MessageHandler): void {
    this.inner.onMessage(handler);
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!shouldDelay(message)) {
      return this.inner.send(message);
    }

    const text = extractText(message);
    const delayMs = calculateDelay(text, this.config);
    const hasTyping = supportsTyping(this.inner);

    // Send initial typing indicator
    if (hasTyping) {
      await this.sendTypingIndicator(message.channelId);
    }

    // Start typing indicator repeat interval
    const intervalId = hasTyping
      ? this.config.clock.setInterval(() => {
          void this.sendTypingIndicator(message.channelId);
        }, this.config.typingRepeatMs)
      : undefined;

    try {
      await sleep(delayMs, this.config.clock);
      await this.inner.send(message);
    } finally {
      if (intervalId !== undefined) {
        this.config.clock.clearInterval(intervalId);
      }
    }
  }

  /** Send a typing indicator to the channel (best-effort, errors swallowed) */
  private async sendTypingIndicator(channelId: string): Promise<void> {
    try {
      await this.inner.send({
        channelId,
        blocks: [],
        metadata: { typingIndicator: true },
      });
    } catch {
      // Best-effort — don't break the send flow for typing indicator failures
    }
  }
}
