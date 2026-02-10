import { CapabilityNotSupportedError } from "@templar/errors";
import type {
  ButtonBlock,
  ChannelAdapter,
  ChannelCapabilities,
  ContentBlock,
  FileBlock,
  ImageBlock,
  MessageHandler,
  OutboundMessage,
  TextBlock,
} from "./types.js";
import { BLOCK_TYPE_TO_CAPABILITY } from "./types.js";

/**
 * CapabilityGuard wraps a ChannelAdapter and enforces capability constraints
 * on every outbound message.
 *
 * - Checks that each content block type is supported by the adapter
 * - Validates block-specific constraints (maxLength, maxSize, formats, etc.)
 * - Validates thread support if threadId is present
 * - Delegates all other calls to the underlying adapter
 *
 * The guard precomputes a Set of supported block types at construction time
 * for O(1) per-block checks on send().
 */
export class CapabilityGuard implements ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  private readonly supportedBlockTypes: ReadonlySet<string>;

  constructor(private readonly adapter: ChannelAdapter) {
    this.name = adapter.name;
    this.capabilities = adapter.capabilities;
    this.supportedBlockTypes = buildSupportedBlockTypes(adapter.capabilities);
  }

  async connect(): Promise<void> {
    return this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  async send(message: OutboundMessage): Promise<void> {
    this.validateMessage(message);
    return this.adapter.send(message);
  }

  onMessage(handler: MessageHandler): void {
    this.adapter.onMessage(handler);
  }

  private validateMessage(message: OutboundMessage): void {
    for (const block of message.blocks) {
      if (!this.supportedBlockTypes.has(block.type)) {
        throw new CapabilityNotSupportedError(this.name, block.type);
      }
      this.validateBlockConstraints(block);
    }

    if (message.threadId !== undefined && !this.capabilities.threads) {
      throw new CapabilityNotSupportedError(this.name, "threads");
    }
  }

  private validateBlockConstraints(block: ContentBlock): void {
    switch (block.type) {
      case "text":
        this.validateTextBlock(block);
        break;
      case "image":
        this.validateImageBlock(block);
        break;
      case "file":
        this.validateFileBlock(block);
        break;
      case "button":
        this.validateButtonBlock(block);
        break;
    }
  }

  private validateTextBlock(block: TextBlock): void {
    const cap = this.capabilities.text;
    if (!cap) return; // already checked via supportedBlockTypes
    if (block.content.length > cap.maxLength) {
      throw new CapabilityNotSupportedError(
        this.name,
        `text (exceeds maxLength of ${cap.maxLength})`,
      );
    }
  }

  private validateImageBlock(block: ImageBlock): void {
    const cap = this.capabilities.images;
    if (!cap) return;
    if (block.size !== undefined && block.size > cap.maxSize) {
      throw new CapabilityNotSupportedError(
        this.name,
        `image (exceeds maxSize of ${cap.maxSize} bytes)`,
      );
    }
    if (block.mimeType !== undefined) {
      const format = mimeTypeToFormat(block.mimeType);
      if (format !== undefined && !cap.formats.includes(format)) {
        throw new CapabilityNotSupportedError(
          this.name,
          `image (format '${format}' not in [${cap.formats.join(", ")}])`,
        );
      }
    }
  }

  private validateFileBlock(block: FileBlock): void {
    const cap = this.capabilities.files;
    if (!cap) return;
    if (block.size !== undefined && block.size > cap.maxSize) {
      throw new CapabilityNotSupportedError(
        this.name,
        `file (exceeds maxSize of ${cap.maxSize} bytes)`,
      );
    }
  }

  private validateButtonBlock(block: ButtonBlock): void {
    const cap = this.capabilities.buttons;
    if (!cap) return;
    if (block.buttons.length > cap.maxButtons) {
      throw new CapabilityNotSupportedError(
        this.name,
        `button (exceeds maxButtons of ${cap.maxButtons})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSupportedBlockTypes(capabilities: ChannelCapabilities): ReadonlySet<string> {
  const types = new Set<string>();
  for (const [blockType, capKey] of Object.entries(BLOCK_TYPE_TO_CAPABILITY)) {
    if (capabilities[capKey] !== undefined) {
      types.add(blockType);
    }
  }
  return types;
}

/**
 * Extract format shorthand from MIME type (e.g., "image/png" → "png")
 */
function mimeTypeToFormat(mimeType: string): string | undefined {
  const parts = mimeType.split("/");
  return parts.length === 2 ? parts[1] : undefined;
}
