import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImapSmtpConfig } from "../../config.js";
import {
  createMockImapClient,
  type MockImapClient,
  SAMPLE_RAW_EMAIL,
} from "../helpers/mock-imap.js";
import { createMockTransporter, type MockTransporter } from "../helpers/mock-smtp.js";

// ---------------------------------------------------------------------------
// Module mocks — use vi.hoisted for variables used in vi.mock factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    imapClient: undefined as unknown,
    transporter: undefined as unknown,
  };
});

vi.mock("imapflow", () => {
  class MockImapFlow {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.imapClient as MockImapFlow;
    }
  }
  return { ImapFlow: MockImapFlow };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => mocks.transporter),
  },
  createTransport: vi.fn(() => mocks.transporter),
}));

vi.mock("postal-mime", () => ({
  default: class MockPostalMime {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    async parse(source: any) {
      const text = source.toString("utf-8");
      const headers: Array<{ key: string; value: string }> = [];
      const headerSection = text.split("\r\n\r\n")[0] ?? "";
      const body = text.split("\r\n\r\n")[1] ?? "";

      let from: { address?: string; name?: string } | undefined;
      let to: Array<{ address?: string; name?: string }> = [];
      let subject = "";
      let messageId = "";
      let date = "";
      let inReplyTo: string | undefined;
      let references: string | undefined;

      for (const line of headerSection.split("\r\n")) {
        const [key, ...rest] = line.split(": ");
        const value = rest.join(": ");
        if (key && value) {
          headers.push({ key: key.toLowerCase(), value });
          switch (key.toLowerCase()) {
            case "from": {
              const match = /(?:(.+?)\s*)?<([^>]+)>/.exec(value);
              from = match
                ? { ...(match[1] ? { name: match[1].trim() } : {}), address: match[2] ?? "" }
                : { address: value };
              break;
            }
            case "to": {
              const m = /(?:(.+?)\s*)?<([^>]+)>/.exec(value);
              to = [
                m
                  ? { ...(m[1] ? { name: m[1].trim() } : {}), address: m[2] ?? "" }
                  : { address: value },
              ];
              break;
            }
            case "subject":
              subject = value;
              break;
            case "message-id":
              messageId = value;
              break;
            case "date":
              date = value;
              break;
            case "in-reply-to":
              inReplyTo = value;
              break;
            case "references":
              references = value;
              break;
          }
        }
      }

      return {
        from,
        to,
        subject,
        messageId,
        date,
        inReplyTo,
        references,
        text: body,
        html: undefined,
        headers,
        attachments: [],
      };
    }
  },
}));

// Import after mocking
const { ImapSmtpProvider } = await import("../../providers/imap-smtp.js");

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testConfig: ImapSmtpConfig = {
  provider: "imap-smtp",
  imap: {
    host: "imap.test.com",
    port: 993,
    secure: true,
    auth: { user: "bot@test.com", pass: "secret" },
  },
  smtp: {
    host: "smtp.test.com",
    port: 587,
    secure: false,
    auth: { user: "bot@test.com", pass: "secret" },
    pool: {
      maxConnections: 3,
      maxMessages: 50,
      rateDelta: 1000,
      rateLimit: 5,
    },
  },
  maxEmailSize: 25_000_000,
  mailbox: "INBOX",
};

describe("ImapSmtpProvider", () => {
  let mockImapClient: MockImapClient;
  let mockTransporter: MockTransporter;

  beforeEach(() => {
    mockImapClient = createMockImapClient();
    mockTransporter = createMockTransporter();
    mocks.imapClient = mockImapClient;
    mocks.transporter = mockTransporter;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  it("creates a provider with type imap-smtp", () => {
    const provider = new ImapSmtpProvider(testConfig);
    expect(provider.type).toBe("imap-smtp");
    expect(provider.isConnected()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------
  it("opens IMAP connection on connect", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    expect(mockImapClient.connect).toHaveBeenCalledOnce();
    expect(provider.isConnected()).toBe(true);
  });

  it("closes IMAP and SMTP on disconnect", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();
    await provider.disconnect();

    expect(mockImapClient.logout).toHaveBeenCalledOnce();
    expect(provider.isConnected()).toBe(false);
  });

  it("handles disconnect when not connected", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.disconnect();
    expect(provider.isConnected()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Listen
  // -----------------------------------------------------------------------
  it("registers listener for new emails", async () => {
    vi.useRealTimers(); // Need real timers for async promise chains
    const provider = new ImapSmtpProvider(testConfig);
    const handler = vi.fn();

    await provider.connect();
    provider.listen(handler);

    // Simulate new email arriving via IMAP
    mockImapClient.fetchOne.mockResolvedValueOnce({
      source: Buffer.from(SAMPLE_RAW_EMAIL),
      uid: 1,
    });

    // Simulate "exists" event (new message count changed)
    mockImapClient._emit("exists", { count: 1, prevCount: 0 });

    // Flush the async promise chain
    await new Promise((r) => setTimeout(r, 50));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "<msg-1@test.com>",
        from: expect.objectContaining({ address: "sender@test.com" }),
        subject: "Test Email",
      }),
    );
    vi.useFakeTimers();
  });

  it("queues listeners registered before connect", async () => {
    vi.useRealTimers(); // Need real timers for async promise chains
    const provider = new ImapSmtpProvider(testConfig);
    const handler = vi.fn();

    // Listen before connect
    provider.listen(handler);

    await provider.connect();

    // Simulate new email
    mockImapClient.fetchOne.mockResolvedValueOnce({
      source: Buffer.from(SAMPLE_RAW_EMAIL),
      uid: 1,
    });
    mockImapClient._emit("exists", { count: 1, prevCount: 0 });

    // Flush the async promise chain
    await new Promise((r) => setTimeout(r, 50));

    expect(handler).toHaveBeenCalledOnce();
    vi.useFakeTimers();
  });

  // -----------------------------------------------------------------------
  // Send (lazy SMTP)
  // -----------------------------------------------------------------------
  it("creates SMTP transporter lazily on first send", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    const email = {
      from: "bot@test.com",
      to: "recipient@test.com",
      subject: "Test",
      text: "Hello",
      html: "Hello",
      attachments: [],
    };

    const messageId = await provider.send(email);

    expect(mockTransporter.sendMail).toHaveBeenCalledOnce();
    expect(messageId).toBe("<sent-1@test.com>");
  });

  it("reuses SMTP transporter on subsequent sends", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    const email = {
      from: "bot@test.com",
      to: "recipient@test.com",
      subject: "Test",
      text: "Hello",
      html: "Hello",
      attachments: [],
    };

    await provider.send(email);
    await provider.send(email);

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it("throws when sending without connection", async () => {
    const provider = new ImapSmtpProvider(testConfig);

    await expect(
      provider.send({
        from: "bot@test.com",
        to: "recipient@test.com",
        subject: "Test",
        text: "Hello",
        html: "Hello",
        attachments: [],
      }),
    ).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // Reconnect
  // -----------------------------------------------------------------------
  it("attempts reconnect on IMAP close event", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    // Reset mock to track reconnect call
    mockImapClient.connect.mockClear();

    // Simulate IMAP close
    mockImapClient._emit("close");

    // Advance past first reconnect delay (1s + jitter)
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockImapClient.connect).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // IDLE restart
  // -----------------------------------------------------------------------
  it("restarts IDLE periodically (25-minute interval)", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    const idleCallsBefore = mockImapClient.idle.mock.calls.length;

    // Fast-forward 25 minutes
    await vi.advanceTimersByTimeAsync(25 * 60 * 1000 + 100);

    expect(mockImapClient.idle.mock.calls.length).toBeGreaterThan(idleCallsBefore);
  });

  // -----------------------------------------------------------------------
  // Cleanup on disconnect
  // -----------------------------------------------------------------------
  it("cleans up SMTP transporter on disconnect", async () => {
    const provider = new ImapSmtpProvider(testConfig);
    await provider.connect();

    // Trigger lazy SMTP creation
    await provider.send({
      from: "bot@test.com",
      to: "recipient@test.com",
      subject: "Test",
      text: "Hello",
      html: "Hello",
      attachments: [],
    });

    await provider.disconnect();

    expect(mockTransporter.close).toHaveBeenCalledOnce();
  });
});
