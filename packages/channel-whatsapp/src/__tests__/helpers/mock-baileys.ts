import { vi } from "vitest";
import type { WAMessage } from "../../normalizer.js";

// ---------------------------------------------------------------------------
// Mock event emitter
// ---------------------------------------------------------------------------

export interface MockEventEmitter {
  readonly handlers: Map<string, Array<(...args: unknown[]) => void>>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

function createMockEventEmitter(): MockEventEmitter {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    handlers,
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    emit(event: string, ...args: unknown[]) {
      const eventHandlers = handlers.get(event) ?? [];
      for (const h of eventHandlers) {
        h(...args);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mock WASocket
// ---------------------------------------------------------------------------

export interface MockWASocket {
  readonly ev: MockEventEmitter;
  readonly sendMessage: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn>;
  readonly logout: ReturnType<typeof vi.fn>;
  user: { id: string } | null;
}

export function createMockSocket(): MockWASocket {
  return {
    ev: createMockEventEmitter(),
    sendMessage: vi.fn(async () => ({})),
    end: vi.fn(),
    logout: vi.fn(async () => {}),
    user: { id: "1234567890@s.whatsapp.net" },
  };
}

// ---------------------------------------------------------------------------
// Mock Baileys module
// ---------------------------------------------------------------------------

export interface MockBaileysModule {
  readonly default: ReturnType<typeof vi.fn>;
  readonly makeCacheableSignalKeyStore: ReturnType<typeof vi.fn>;
  readonly fetchLatestBaileysVersion: ReturnType<typeof vi.fn>;
  readonly downloadMediaMessage: ReturnType<typeof vi.fn>;
  readonly Browsers: { macOS: (browser: string) => readonly [string, string, string] };
  readonly mockSocket: MockWASocket;
}

export function createMockBaileysModule(): MockBaileysModule {
  const mockSocket = createMockSocket();

  return {
    default: vi.fn(() => mockSocket),
    makeCacheableSignalKeyStore: vi.fn((keys: unknown) => keys),
    fetchLatestBaileysVersion: vi.fn(async () => ({ version: [2, 2412, 1] })),
    downloadMediaMessage: vi.fn(async () => Buffer.from("mock-media-content")),
    Browsers: {
      macOS: (browser: string) => ["Templar", browser, "22.0"] as const,
    },
    mockSocket,
  };
}

// ---------------------------------------------------------------------------
// Mock WAMessage factory
// ---------------------------------------------------------------------------

export interface MockMessageOptions {
  readonly fromMe?: boolean;
  readonly remoteJid?: string;
  readonly participant?: string;
  readonly id?: string;
  readonly text?: string;
  readonly extendedText?: string;
  readonly imageCaption?: string;
  readonly imageMimetype?: string;
  readonly imageFileLength?: number;
  readonly videoCaption?: string;
  readonly videoMimetype?: string;
  readonly audioMimetype?: string;
  readonly audioPtt?: boolean;
  readonly documentMimetype?: string;
  readonly documentFileName?: string;
  readonly ephemeral?: boolean;
  readonly timestamp?: number;
  readonly pushName?: string;
}

export function createMockMessage(options: MockMessageOptions = {}): WAMessage {
  const {
    fromMe = false,
    remoteJid = "5511999999999@s.whatsapp.net",
    participant,
    id = `msg-${Date.now()}`,
    text,
    extendedText,
    imageCaption,
    imageMimetype,
    imageFileLength,
    videoCaption,
    videoMimetype,
    audioMimetype,
    audioPtt,
    documentMimetype,
    documentFileName,
    ephemeral = false,
    timestamp = Math.floor(Date.now() / 1000),
    pushName = "Test User",
  } = options;

  const messageContent: Record<string, unknown> = {};

  if (text != null) {
    messageContent.conversation = text;
  }

  if (extendedText != null) {
    messageContent.extendedTextMessage = { text: extendedText };
  }

  if (imageMimetype != null || imageCaption != null) {
    messageContent.imageMessage = {
      url: "https://example.com/image.jpg",
      mimetype: imageMimetype ?? "image/jpeg",
      caption: imageCaption ?? null,
      fileLength: imageFileLength ?? null,
      fileName: null,
    };
  }

  if (videoMimetype != null || videoCaption != null) {
    messageContent.videoMessage = {
      url: "https://example.com/video.mp4",
      mimetype: videoMimetype ?? "video/mp4",
      caption: videoCaption ?? null,
      fileLength: null,
      fileName: null,
    };
  }

  if (audioMimetype != null) {
    messageContent.audioMessage = {
      url: "https://example.com/audio.ogg",
      mimetype: audioMimetype,
      ptt: audioPtt ?? false,
      fileLength: null,
      fileName: null,
    };
  }

  if (documentMimetype != null) {
    messageContent.documentMessage = {
      url: "https://example.com/doc.pdf",
      mimetype: documentMimetype,
      fileName: documentFileName ?? "document.pdf",
      fileLength: null,
    };
  }

  const actualMessage = Object.keys(messageContent).length > 0 ? messageContent : null;

  const message = ephemeral ? { ephemeralMessage: { message: actualMessage } } : actualMessage;

  return {
    key: {
      remoteJid,
      fromMe,
      id,
      participant: participant ?? null,
    },
    message: message as WAMessage["message"],
    messageTimestamp: timestamp,
    pushName,
  };
}
