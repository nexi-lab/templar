import type { Api } from "grammy";
import type {
  Chat,
  Document,
  Message,
  MessageEntity,
  PhotoSize,
  Update,
  User,
  UserFromGetMe,
  Voice,
} from "grammy/types";

// ---------------------------------------------------------------------------
// Captured API call type
// ---------------------------------------------------------------------------

export interface CapturedApiCall {
  readonly method: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mock Bot Info
// ---------------------------------------------------------------------------

export const MOCK_BOT_INFO: UserFromGetMe = {
  id: 999,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

// ---------------------------------------------------------------------------
// Mock API — captures outgoing calls
// ---------------------------------------------------------------------------

export function createMockApi(): { api: Api; calls: CapturedApiCall[] } {
  const calls: CapturedApiCall[] = [];

  // Minimal mock that intercepts all method calls.
  // grammY API methods accept positional args (e.g., api.getFile(fileId)).
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "config") {
        return { use: () => {} };
      }
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined; // Prevent proxy from being treated as a thenable
      }
      // Return a function that captures the call
      return (...args: unknown[]) => {
        const payload =
          args.length === 1 && typeof args[0] === "object" && args[0] !== null
            ? (args[0] as Record<string, unknown>)
            : { _args: args };
        calls.push({ method: prop, payload });

        // Return mock responses based on method
        if (prop === "getFile") {
          const fileId = typeof args[0] === "string" ? args[0] : String(args[0]);
          return Promise.resolve({
            file_id: fileId,
            file_unique_id: "unique_123",
            file_path: `photos/${fileId}.jpg`,
          });
        }
        if (prop === "sendMessage") {
          return Promise.resolve({
            message_id: Math.floor(Math.random() * 10000),
            date: Math.floor(Date.now() / 1000),
            chat: { id: args[0], type: "private" },
          });
        }
        if (prop === "sendPhoto" || prop === "sendDocument") {
          return Promise.resolve({
            message_id: Math.floor(Math.random() * 10000),
            date: Math.floor(Date.now() / 1000),
            chat: { id: args[0], type: "private" },
          });
        }
        if (prop === "sendChatAction") {
          return Promise.resolve(true);
        }
        return Promise.resolve({ ok: true, result: true });
      };
    },
  };

  const api = new Proxy({}, handler) as unknown as Api;
  return { api, calls };
}

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------

const DEFAULT_USER: User = {
  id: 456,
  is_bot: false,
  first_name: "TestUser",
};

const DEFAULT_CHAT: Chat.PrivateChat = {
  id: 123,
  type: "private",
  first_name: "TestUser",
};

function baseMessage(overrides: Partial<Message> = {}): Message & Update.NonChannel {
  return {
    message_id: Math.floor(Math.random() * 10000),
    date: Math.floor(Date.now() / 1000),
    chat: DEFAULT_CHAT,
    from: DEFAULT_USER,
    ...overrides,
  } as Message & Update.NonChannel;
}

// ---------------------------------------------------------------------------
// Update factories
// ---------------------------------------------------------------------------

export interface TextUpdateOptions {
  readonly chatId?: number;
  readonly userId?: number;
  readonly entities?: readonly MessageEntity[];
  readonly messageThreadId?: number;
}

export function createTextUpdate(text: string, opts: TextUpdateOptions = {}): Update {
  const chat = opts.chatId ? { ...DEFAULT_CHAT, id: opts.chatId } : DEFAULT_CHAT;
  const from = opts.userId ? { ...DEFAULT_USER, id: opts.userId } : DEFAULT_USER;

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: baseMessage({
      chat,
      from,
      text,
      ...(opts.entities ? { entities: [...opts.entities] } : {}),
      ...(opts.messageThreadId != null ? { message_thread_id: opts.messageThreadId } : {}),
    }),
  };
}

export interface PhotoUpdateOptions {
  readonly chatId?: number;
  readonly userId?: number;
  readonly caption?: string;
  readonly captionEntities?: readonly MessageEntity[];
  readonly sizes?: readonly PhotoSize[];
}

export function createPhotoUpdate(fileId: string, opts: PhotoUpdateOptions = {}): Update {
  const defaultSizes: PhotoSize[] = [
    { file_id: `${fileId}_small`, file_unique_id: "s1", width: 90, height: 90 },
    { file_id: `${fileId}_medium`, file_unique_id: "s2", width: 320, height: 320 },
    { file_id: fileId, file_unique_id: "s3", width: 800, height: 800, file_size: 50000 },
  ];

  const msg = baseMessage({
    photo: opts.sizes ? [...opts.sizes] : defaultSizes,
    ...(opts.caption != null ? { caption: opts.caption } : {}),
    ...(opts.captionEntities ? { caption_entities: [...opts.captionEntities] } : {}),
  });

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: msg,
  };
}

export interface DocumentUpdateOptions {
  readonly chatId?: number;
  readonly userId?: number;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly fileSize?: number;
}

export function createDocumentUpdate(fileId: string, opts: DocumentUpdateOptions = {}): Update {
  const doc: Document = {
    file_id: fileId,
    file_unique_id: "doc_unique",
    file_name: opts.fileName ?? "test.pdf",
    mime_type: opts.mimeType ?? "application/pdf",
    file_size: opts.fileSize ?? 1024,
  };

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: baseMessage({ document: doc }),
  };
}

export interface VoiceUpdateOptions {
  readonly chatId?: number;
  readonly userId?: number;
  readonly duration?: number;
  readonly mimeType?: string;
}

export function createVoiceUpdate(fileId: string, opts: VoiceUpdateOptions = {}): Update {
  const voice: Voice = {
    file_id: fileId,
    file_unique_id: "voice_unique",
    duration: opts.duration ?? 5,
    mime_type: opts.mimeType ?? "audio/ogg",
  };

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: baseMessage({ voice }),
  };
}

export interface GroupUpdateOptions {
  readonly chatId?: number;
  readonly userId?: number;
  readonly threadId?: number;
  readonly botMention?: boolean;
}

export function createGroupUpdate(text: string, opts: GroupUpdateOptions = {}): Update {
  const groupChat: Chat.SupergroupChat = {
    id: opts.chatId ?? -100123456,
    type: "supergroup",
    title: "Test Group",
  };

  const entities: MessageEntity[] = [];
  let finalText = text;

  if (opts.botMention) {
    const mentionText = `@${MOCK_BOT_INFO.username}`;
    finalText = `${mentionText} ${text}`;
    entities.push({
      type: "mention",
      offset: 0,
      length: mentionText.length,
    });
  }

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: baseMessage({
      chat: groupChat,
      from: opts.userId ? { ...DEFAULT_USER, id: opts.userId } : DEFAULT_USER,
      text: finalText,
      ...(entities.length > 0 ? { entities } : {}),
      ...(opts.threadId != null ? { message_thread_id: opts.threadId } : {}),
    }),
  };
}

/**
 * Create an update with no extractable content (e.g., sticker)
 */
export function createStickerUpdate(): Update {
  return {
    update_id: Math.floor(Math.random() * 100000),
    message: baseMessage({
      sticker: {
        file_id: "sticker_123",
        file_unique_id: "sticker_unique",
        type: "regular",
        width: 512,
        height: 512,
        is_animated: false,
        is_video: false,
      },
    }),
  };
}

/**
 * Create an update with no message (e.g., callback query only)
 */
export function createCallbackQueryUpdate(): Update {
  return {
    update_id: Math.floor(Math.random() * 100000),
    callback_query: {
      id: "cb_123",
      from: DEFAULT_USER,
      chat_instance: "instance_123",
      data: "test_callback",
    },
  };
}

/**
 * Build a file download URL from a token and file_path
 */
export function buildFileUrl(token: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}
