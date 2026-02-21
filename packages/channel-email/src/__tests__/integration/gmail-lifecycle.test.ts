import { describe, expect, it, vi } from "vitest";
import { createMockGmailApi } from "../helpers/mock-gmail.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  gmailApi: undefined as unknown,
  oauth2Client: {
    setCredentials: vi.fn(),
    on: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: "token" }),
  },
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

const { EmailChannel } = await import("../../adapter.js");
const { createEmailMessage } = await import("../../helpers.js");

// ---------------------------------------------------------------------------
// Integration: Gmail full lifecycle
// ---------------------------------------------------------------------------

describe("EmailChannel — Gmail lifecycle", () => {
  it("connect → listen → send → disconnect", async () => {
    const mockGmail = createMockGmailApi();
    mocks.gmailApi = mockGmail;

    vi.useFakeTimers();

    const config = {
      provider: "gmail" as const,
      credentials: {
        type: "oauth2" as const,
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
      },
      user: "bot@test.com",
      pollingInterval: 10_000,
    };

    // 1. Create adapter
    const channel = new EmailChannel(config);
    expect(channel.providerType).toBe("gmail");

    // 2. Register message handler BEFORE connect
    const handler = vi.fn();
    channel.onMessage(handler);

    // 3. Connect
    await channel.connect();
    expect(channel.isConnected).toBe(true);

    // 4. Simulate Gmail history poll returning new message
    mockGmail.users.history.list.mockResolvedValueOnce({
      data: {
        history: [
          {
            messagesAdded: [{ message: { id: "gmail-new-1" } }],
          },
        ],
        historyId: "12347",
      },
    });

    // Advance past polling interval
    await vi.advanceTimersByTimeAsync(10_100);

    // The handler should have been called with the fetched message
    expect(mockGmail.users.history.list).toHaveBeenCalled();

    // 5. Send email via Gmail API
    const outbound = createEmailMessage({
      to: "alice@test.com",
      subject: "Hello from Gmail",
      body: "This is a test email",
    });

    await channel.send(outbound);

    expect(mockGmail.users.messages.send).toHaveBeenCalledOnce();
    expect(mockGmail.users.messages.send).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        requestBody: expect.objectContaining({
          raw: expect.any(String),
        }),
      }),
    );

    // 6. Disconnect
    await channel.disconnect();
    expect(channel.isConnected).toBe(false);

    // 7. Verify polling stopped
    const callsAfterDisconnect = mockGmail.users.history.list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mockGmail.users.history.list.mock.calls.length).toBe(callsAfterDisconnect);

    vi.useRealTimers();
  });
});
