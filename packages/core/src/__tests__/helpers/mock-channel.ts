import { vi } from "vitest";
import type {
  ButtonCapability,
  ChannelAdapter,
  ChannelCapabilities,
  FileCapability,
  GroupCapability,
  ImageCapability,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
  RichTextCapability,
  TextCapability,
  ThreadCapability,
  VoiceMessageCapability,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Sensible Defaults for Capability Groups
// ---------------------------------------------------------------------------

const DEFAULT_TEXT: TextCapability = { supported: true, maxLength: 4000 };
const DEFAULT_RICH_TEXT: RichTextCapability = { supported: true, formats: ["markdown"] };
const DEFAULT_IMAGES: ImageCapability = {
  supported: true,
  maxSize: 10_000_000,
  formats: ["png", "jpg", "gif", "webp"],
};
const DEFAULT_FILES: FileCapability = { supported: true, maxSize: 50_000_000 };
const DEFAULT_BUTTONS: ButtonCapability = { supported: true, maxButtons: 5 };
const DEFAULT_THREADS: ThreadCapability = { supported: true, nested: false };
const DEFAULT_VOICE: VoiceMessageCapability = {
  supported: true,
  maxDuration: 300,
  formats: ["ogg", "mp3"],
};
const DEFAULT_GROUPS: GroupCapability = { supported: true, maxMembers: 100 };

// ---------------------------------------------------------------------------
// Factory Options
// ---------------------------------------------------------------------------

export interface MockAdapterOptions {
  name?: string;
  text?: boolean | Partial<Omit<TextCapability, "supported">>;
  richText?: boolean | Partial<Omit<RichTextCapability, "supported">>;
  images?: boolean | Partial<Omit<ImageCapability, "supported">>;
  files?: boolean | Partial<Omit<FileCapability, "supported">>;
  buttons?: boolean | Partial<Omit<ButtonCapability, "supported">>;
  threads?: boolean | Partial<Omit<ThreadCapability, "supported">>;
  reactions?: boolean;
  typingIndicator?: boolean;
  readReceipts?: boolean;
  voiceMessages?: boolean | Partial<Omit<VoiceMessageCapability, "supported">>;
  groups?: boolean | Partial<Omit<GroupCapability, "supported">>;
}

/**
 * Build a ChannelCapabilities object from shorthand options.
 *
 * - `true` expands to the full default group
 * - An object merges with the default group
 * - Absent keys remain undefined (unsupported)
 */
function buildCapabilities(options: MockAdapterOptions): ChannelCapabilities {
  const caps: ChannelCapabilities = {};
  const mutable = caps as Record<string, unknown>;

  if (options.text !== undefined) {
    mutable.text = options.text === true ? DEFAULT_TEXT : { ...DEFAULT_TEXT, ...options.text };
  }
  if (options.richText !== undefined) {
    mutable.richText =
      options.richText === true ? DEFAULT_RICH_TEXT : { ...DEFAULT_RICH_TEXT, ...options.richText };
  }
  if (options.images !== undefined) {
    mutable.images =
      options.images === true ? DEFAULT_IMAGES : { ...DEFAULT_IMAGES, ...options.images };
  }
  if (options.files !== undefined) {
    mutable.files = options.files === true ? DEFAULT_FILES : { ...DEFAULT_FILES, ...options.files };
  }
  if (options.buttons !== undefined) {
    mutable.buttons =
      options.buttons === true ? DEFAULT_BUTTONS : { ...DEFAULT_BUTTONS, ...options.buttons };
  }
  if (options.threads !== undefined) {
    mutable.threads =
      options.threads === true ? DEFAULT_THREADS : { ...DEFAULT_THREADS, ...options.threads };
  }
  if (options.reactions === true) {
    mutable.reactions = { supported: true };
  }
  if (options.typingIndicator === true) {
    mutable.typingIndicator = { supported: true };
  }
  if (options.readReceipts === true) {
    mutable.readReceipts = { supported: true };
  }
  if (options.voiceMessages !== undefined) {
    mutable.voiceMessages =
      options.voiceMessages === true
        ? DEFAULT_VOICE
        : { ...DEFAULT_VOICE, ...options.voiceMessages };
  }
  if (options.groups !== undefined) {
    mutable.groups =
      options.groups === true ? DEFAULT_GROUPS : { ...DEFAULT_GROUPS, ...options.groups };
  }

  return caps;
}

// ---------------------------------------------------------------------------
// MockChannelAdapter (class — updated for grouped capabilities)
// ---------------------------------------------------------------------------

/**
 * Mock ChannelAdapter for testing
 *
 * All methods are vitest mock functions that can be asserted against.
 *
 * @example
 * ```typescript
 * const mock = new MockChannelAdapter('test-channel', { text: true, images: true });
 * await mock.connect();
 * expect(mock.connect).toHaveBeenCalled();
 * ```
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  readonly connect: () => Promise<void> = vi.fn<() => Promise<void>>(async () => {});

  readonly disconnect: () => Promise<void> = vi.fn<() => Promise<void>>(async () => {});

  readonly send: (message: OutboundMessage) => Promise<void> = vi.fn<
    (message: OutboundMessage) => Promise<void>
  >(async (_message: OutboundMessage) => {});

  readonly onMessage: (handler: MessageHandler) => void = vi.fn<(handler: MessageHandler) => void>(
    (_handler: MessageHandler) => {},
  );

  constructor(name = "mock-channel", options: MockAdapterOptions = {}) {
    this.name = name;
    // Default to text-only if no options given
    const hasAnyCap = Object.keys(options).some(
      (k) => k !== "name" && options[k as keyof MockAdapterOptions] !== undefined,
    );
    this.capabilities = hasAnyCap ? buildCapabilities(options) : buildCapabilities({ text: true });
  }

  reset(): void {
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.connect as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.disconnect as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.send as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.onMessage as any).mockClear();
  }
}

// ---------------------------------------------------------------------------
// Factory Function (preferred API)
// ---------------------------------------------------------------------------

/**
 * Create a mock adapter with smart defaults.
 *
 * @example
 * ```typescript
 * // Text-only adapter (default)
 * const basic = createMockAdapter();
 *
 * // Slack-like adapter
 * const slack = createMockAdapter({ name: 'slack', text: true, images: true, threads: true, reactions: true });
 *
 * // Custom image constraints
 * const strict = createMockAdapter({ images: { maxSize: 1_000_000, formats: ['png'] } });
 * ```
 */
export function createMockAdapter(options: MockAdapterOptions = {}): MockChannelAdapter {
  return new MockChannelAdapter(options.name, options);
}

/**
 * Create a helper InboundMessage for testing handlers
 */
export function createMockInboundMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channelType: "mock",
    channelId: "test-channel",
    senderId: "user-1",
    blocks: [{ type: "text", content: "Hello" }],
    timestamp: Date.now(),
    messageId: `msg-${Math.random().toString(36).slice(2, 10)}`,
    raw: {},
    ...overrides,
  };
}
