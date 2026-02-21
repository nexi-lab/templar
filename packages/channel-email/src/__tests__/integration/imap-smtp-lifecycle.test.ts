import { describe, expect, it, vi } from "vitest";
import { createMockImapClient, SAMPLE_RAW_EMAIL } from "../helpers/mock-imap.js";
import { createMockTransporter } from "../helpers/mock-smtp.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  imapClient: undefined as unknown,
  transporter: undefined as unknown,
}));

vi.mock("imapflow", () => {
  class MockImapFlow {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.imapClient;
    }
  }
  return { ImapFlow: MockImapFlow };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => mocks.transporter) },
  createTransport: vi.fn(() => mocks.transporter),
}));

vi.mock("postal-mime", () => ({
  default: class MockPostalMime {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    async parse(source: any) {
      const text = source.toString("utf-8");
      const headerSection = text.split("\r\n\r\n")[0] ?? "";
      const body = text.split("\r\n\r\n")[1] ?? "";
      const headers: Array<{ key: string; value: string }> = [];

      let from: { address?: string; name?: string } | undefined;
      let to: Array<{ address?: string; name?: string }> = [];
      let subject = "";
      let messageId = "";
      let date = "";

      for (const line of headerSection.split("\r\n")) {
        const colonIdx = line.indexOf(": ");
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 2);
        headers.push({ key: key.toLowerCase(), value });
        switch (key.toLowerCase()) {
          case "from": {
            const m = /(?:(.+?)\s*)?<([^>]+)>/.exec(value);
            from = m ? { name: m[1]?.trim(), address: m[2] } : { address: value };
            break;
          }
          case "to": {
            const m = /(?:(.+?)\s*)?<([^>]+)>/.exec(value);
            to = [m ? { name: m[1]?.trim(), address: m[2] } : { address: value }];
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
        }
      }

      return {
        from,
        to,
        subject,
        messageId,
        date,
        text: body,
        html: undefined,
        headers,
        attachments: [],
      };
    }
  },
}));

const { EmailChannel } = await import("../../adapter.js");
const { createEmailMessage } = await import("../../helpers.js");

// ---------------------------------------------------------------------------
// Integration: IMAP/SMTP full lifecycle
// ---------------------------------------------------------------------------

describe("EmailChannel — IMAP/SMTP lifecycle", () => {
  it("connect → onMessage → send → disconnect", async () => {
    const mockImap = createMockImapClient();
    const mockSmtp = createMockTransporter();
    mocks.imapClient = mockImap;
    mocks.transporter = mockSmtp;

    const config = {
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

    // 1. Create adapter
    const channel = new EmailChannel(config);
    expect(channel.name).toBe("email");

    // 2. Register message handler BEFORE connect
    const handler = vi.fn();
    channel.onMessage(handler);

    // 3. Connect
    await channel.connect();
    expect(channel.isConnected).toBe(true);

    // 4. Simulate inbound email
    mockImap.fetchOne.mockResolvedValueOnce({
      source: Buffer.from(SAMPLE_RAW_EMAIL),
      uid: 1,
    });
    mockImap._emit("exists", { count: 1, prevCount: 0 });

    // Wait for async chain
    await new Promise((r) => setTimeout(r, 100));

    expect(handler).toHaveBeenCalledOnce();
    // biome-ignore lint/style/noNonNullAssertion: test assertion after toHaveBeenCalledOnce
    const inbound = handler.mock.calls[0]![0]!;
    expect(inbound.channelType).toBe("email");
    expect(inbound.senderId).toBe("sender@test.com");
    expect(inbound.blocks.length).toBeGreaterThan(0);

    // 5. Send outbound email using helper
    const outbound = createEmailMessage({
      to: "alice@test.com",
      subject: "Reply",
      body: "Thanks for your email!",
    });

    await channel.send(outbound);

    expect(mockSmtp.sendMail).toHaveBeenCalledOnce();
    expect(mockSmtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@test.com",
        subject: "Reply",
        text: "Thanks for your email!",
      }),
    );

    // 6. Disconnect
    await channel.disconnect();
    expect(channel.isConnected).toBe(false);
    expect(mockImap.logout).toHaveBeenCalled();
    expect(mockSmtp.close).toHaveBeenCalled();
  });
});
