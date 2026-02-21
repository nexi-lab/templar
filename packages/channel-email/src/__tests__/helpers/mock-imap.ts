import { vi } from "vitest";

/**
 * Mock ImapFlow client for testing.
 * Simulates IMAP connection, IDLE, and message fetching.
 */
export interface MockImapClient {
  connect: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  idle: ReturnType<typeof vi.fn>;
  getMailboxLock: ReturnType<typeof vi.fn>;
  fetchOne: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  mailbox: { exists: number };
  usable: boolean;
  // Event handlers storage
  _handlers: Map<string, Array<(...args: unknown[]) => void>>;
  _emit: (event: string, ...args: unknown[]) => void;
}

export function createMockImapClient(): MockImapClient {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const client: MockImapClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    idle: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    fetchOne: vi.fn().mockResolvedValue({
      source: Buffer.from(
        "From: sender@test.com\r\nTo: bot@test.com\r\nSubject: Test\r\n\r\nHello",
      ),
      uid: 1,
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    }),
    close: vi.fn().mockResolvedValue(undefined),
    mailbox: { exists: 0 },
    usable: true,
    _handlers: handlers,
    _emit: (event: string, ...args: unknown[]) => {
      const eventHandlers = handlers.get(event) ?? [];
      for (const handler of eventHandlers) {
        handler(...args);
      }
    },
  };

  return client;
}

/**
 * Sample raw email in RFC 5322 format for testing with postal-mime.
 */
export const SAMPLE_RAW_EMAIL = [
  "From: Sender <sender@test.com>",
  "To: Bot <bot@test.com>",
  "Subject: Test Email",
  "Date: Thu, 15 Jan 2026 10:00:00 +0000",
  "Message-ID: <msg-1@test.com>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello from IMAP",
].join("\r\n");

export const SAMPLE_HTML_EMAIL = [
  "From: Sender <sender@test.com>",
  "To: Bot <bot@test.com>",
  "Subject: HTML Email",
  "Date: Thu, 15 Jan 2026 10:00:00 +0000",
  "Message-ID: <msg-html@test.com>",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<h1>Hello from IMAP</h1>",
].join("\r\n");

export const SAMPLE_REPLY_EMAIL = [
  "From: Sender <sender@test.com>",
  "To: Bot <bot@test.com>",
  "Subject: Re: Test Email",
  "Date: Thu, 15 Jan 2026 11:00:00 +0000",
  "Message-ID: <msg-reply@test.com>",
  "In-Reply-To: <msg-1@test.com>",
  "References: <msg-1@test.com>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "This is a reply",
].join("\r\n");
