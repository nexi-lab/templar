import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Captured API call type
// ---------------------------------------------------------------------------

export interface CapturedApiCall {
  readonly method: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mock Discord Message
// ---------------------------------------------------------------------------

export interface MockDiscordMessage {
  id: string;
  content: string;
  author: { id: string; bot: boolean; username: string };
  channelId: string;
  channel: {
    id: string;
    type: number;
    isThread: () => boolean;
    send: ReturnType<typeof vi.fn>;
  };
  guildId: string | null;
  attachments: Map<string, MockAttachment>;
  embeds: MockEmbed[];
  createdTimestamp: number;
  reference: { messageId: string } | null;
}

export interface MockAttachment {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  size: number;
}

export interface MockEmbed {
  description: string | null;
  fields: { name: string; value: string }[];
}

export function createMockMessage(overrides: Partial<MockDiscordMessage> = {}): MockDiscordMessage {
  const channelId = overrides.channelId ?? "chan-001";
  return {
    id: "msg-001",
    content: "Hello from Discord",
    author: { id: "user-001", bot: false, username: "testuser" },
    channelId,
    channel: {
      id: channelId,
      type: 0, // GuildText
      isThread: () => false,
      send: vi.fn().mockResolvedValue({ id: "sent-001" }),
    },
    guildId: "guild-001",
    attachments: new Map(),
    embeds: [],
    createdTimestamp: 1700000000000,
    reference: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Discord Client
// ---------------------------------------------------------------------------

export interface MockClientInstance {
  readonly login: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly on: ReturnType<typeof vi.fn>;
  readonly channels: {
    fetch: ReturnType<typeof vi.fn>;
  };
  readonly user: { id: string; username: string } | null;
  readonly eventHandlers: Map<string, Array<(...args: unknown[]) => Promise<void>>>;
}

export function createMockClientInstance(): MockClientInstance {
  const eventHandlers = new Map<string, Array<(...args: unknown[]) => Promise<void>>>();

  return {
    login: vi.fn().mockResolvedValue("token"),
    destroy: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => Promise<void>) => {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
    }),
    channels: {
      fetch: vi.fn().mockResolvedValue({
        id: "chan-001",
        type: 0,
        isThread: () => false,
        send: vi.fn().mockResolvedValue({ id: "sent-001" }),
      }),
    },
    user: { id: "bot-001", username: "testbot" },
    eventHandlers,
  };
}

// ---------------------------------------------------------------------------
// Mock TextChannel for renderer tests
// ---------------------------------------------------------------------------

export function createMockTextChannel(): {
  channel: { send: ReturnType<typeof vi.fn>; id: string };
  calls: CapturedApiCall[];
} {
  const calls: CapturedApiCall[] = [];
  const send = vi.fn(async (payload: Record<string, unknown>) => {
    calls.push({ method: "channel.send", payload });
    return { id: "sent-001" };
  });

  return {
    channel: { send, id: "chan-001" },
    calls,
  };
}
