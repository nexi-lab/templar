import { describe, expect, it, vi } from "vitest";
import { createMockGmailApi } from "../helpers/mock-gmail.js";
import { createMockImapClient } from "../helpers/mock-imap.js";
import { createMockTransporter } from "../helpers/mock-smtp.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  imapClient: undefined as unknown,
  transporter: undefined as unknown,
  gmailApi: undefined as unknown,
  oauth2Client: {
    setCredentials: vi.fn(),
    on: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: "token" }),
  },
}));

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
  default: { createTransport: vi.fn(() => mocks.transporter) },
  createTransport: vi.fn(() => mocks.transporter),
}));

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => mocks.gmailApi),
    auth: {
      OAuth2: class {
        constructor() {
          // biome-ignore lint/correctness/noConstructorReturn: Test pattern
          return mocks.oauth2Client;
        }
      },
    },
  },
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.oauth2Client;
    }
  },
  JWT: class {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.oauth2Client;
    }
  },
}));

vi.mock("postal-mime", () => ({
  default: class {
    async parse() {
      return { from: {}, to: [], subject: "", messageId: "", headers: [], attachments: [] };
    }
  },
}));

const { EmailChannel } = await import("../../adapter.js");

// ---------------------------------------------------------------------------
// Configs
// ---------------------------------------------------------------------------

const imapSmtpConfig = {
  provider: "imap-smtp" as const,
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
  },
};

const gmailConfig = {
  provider: "gmail" as const,
  credentials: {
    type: "oauth2" as const,
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtoken",
  },
  user: "bot@test.com",
};

describe("EmailChannel", () => {
  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  it("creates an adapter with name 'email'", () => {
    mocks.imapClient = createMockImapClient();
    const channel = new EmailChannel(imapSmtpConfig);
    expect(channel.name).toBe("email");
  });

  it("selects imap-smtp provider from config", () => {
    mocks.imapClient = createMockImapClient();
    const channel = new EmailChannel(imapSmtpConfig);
    expect(channel.providerType).toBe("imap-smtp");
  });

  it("selects gmail provider from config", () => {
    mocks.gmailApi = createMockGmailApi();
    const channel = new EmailChannel(gmailConfig);
    expect(channel.providerType).toBe("gmail");
  });

  it("exposes email capabilities", () => {
    mocks.imapClient = createMockImapClient();
    const channel = new EmailChannel(imapSmtpConfig);
    expect(channel.capabilities.text).toBeDefined();
    expect(channel.capabilities.threads).toBeDefined();
    expect(channel.capabilities.buttons).toBeUndefined();
  });

  it("throws on invalid config", () => {
    expect(() => new EmailChannel({ provider: "invalid" })).toThrow("Invalid config");
  });

  // -----------------------------------------------------------------------
  // Lifecycle — IMAP/SMTP
  // -----------------------------------------------------------------------
  it("connects and disconnects with IMAP/SMTP provider", async () => {
    const mockImap = createMockImapClient();
    const mockSmtp = createMockTransporter();
    mocks.imapClient = mockImap;
    mocks.transporter = mockSmtp;

    const channel = new EmailChannel(imapSmtpConfig);
    await channel.connect();
    expect(channel.isConnected).toBe(true);

    await channel.disconnect();
    expect(channel.isConnected).toBe(false);
  });

  it("connect is idempotent", async () => {
    const mockImap = createMockImapClient();
    mocks.imapClient = mockImap;

    const channel = new EmailChannel(imapSmtpConfig);
    await channel.connect();
    await channel.connect(); // second call should be no-op

    expect(mockImap.connect).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Lifecycle — Gmail
  // -----------------------------------------------------------------------
  it("connects and disconnects with Gmail provider", async () => {
    mocks.gmailApi = createMockGmailApi();

    const channel = new EmailChannel(gmailConfig);
    await channel.connect();
    expect(channel.isConnected).toBe(true);

    await channel.disconnect();
    expect(channel.isConnected).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Send guard
  // -----------------------------------------------------------------------
  it("throws when sending before connect", async () => {
    mocks.imapClient = createMockImapClient();
    const channel = new EmailChannel(imapSmtpConfig);

    await expect(
      channel.send({
        channelId: "recipient@test.com",
        blocks: [{ type: "text", content: "Hello" }],
      }),
    ).rejects.toThrow("not connected");
  });

  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------
  it("sends a message through IMAP/SMTP provider", async () => {
    const mockImap = createMockImapClient();
    const mockSmtp = createMockTransporter();
    mocks.imapClient = mockImap;
    mocks.transporter = mockSmtp;

    const channel = new EmailChannel(imapSmtpConfig);
    await channel.connect();

    await channel.send({
      channelId: "recipient@test.com",
      blocks: [{ type: "text", content: "Hello" }],
      metadata: { subject: "Test" },
    });

    expect(mockSmtp.sendMail).toHaveBeenCalledOnce();
    expect(mockSmtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@test.com",
        subject: "Test",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // onMessage
  // -----------------------------------------------------------------------
  it("registers message handler", async () => {
    const mockImap = createMockImapClient();
    mocks.imapClient = mockImap;

    const channel = new EmailChannel(imapSmtpConfig);
    const handler = vi.fn();

    channel.onMessage(handler);
    await channel.connect();

    // The handler should be registered (via registerListener → provider.listen)
    // We can't easily test the full flow here since it involves async postal-mime parsing
    // That's covered by integration tests
    expect(mockImap.on).toHaveBeenCalled();
  });
});
