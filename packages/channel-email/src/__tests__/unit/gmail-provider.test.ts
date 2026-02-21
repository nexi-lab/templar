import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GmailConfig } from "../../config.js";
import { createMockGmailApi, type MockGmailApi } from "../helpers/mock-gmail.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    gmailApi: undefined as unknown,
    oauth2Client: {
      setCredentials: vi.fn(),
      on: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue({ token: "access-token" }),
    },
  };
});

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => mocks.gmailApi),
    auth: {
      OAuth2: class MockOAuth2 {
        constructor() {
          // biome-ignore lint/correctness/noConstructorReturn: Test pattern
          return mocks.oauth2Client;
        }
      },
    },
  },
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class MockOAuth2Client {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.oauth2Client;
    }
  },
  JWT: class MockJWT {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Test pattern
      return mocks.oauth2Client;
    }
  },
}));

// Import after mocking
const { GmailProvider } = await import("../../providers/gmail.js");

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testConfig: GmailConfig = {
  provider: "gmail",
  credentials: {
    type: "oauth2",
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  },
  user: "bot@test.com",
  pollingInterval: 30_000,
  maxEmailSize: 25_000_000,
};

describe("GmailProvider", () => {
  let mockGmailApi: MockGmailApi;

  beforeEach(() => {
    mockGmailApi = createMockGmailApi();
    mocks.gmailApi = mockGmailApi;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  it("creates a provider with type gmail", () => {
    const provider = new GmailProvider(testConfig);
    expect(provider.type).toBe("gmail");
    expect(provider.isConnected()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------
  it("connects by initializing Gmail API client and getting profile", async () => {
    const provider = new GmailProvider(testConfig);
    await provider.connect();

    expect(provider.isConnected()).toBe(true);
    expect(mockGmailApi.users.getProfile).toHaveBeenCalledWith({
      userId: "me",
    });
  });

  it("disconnects and stops polling", async () => {
    const provider = new GmailProvider(testConfig);
    await provider.connect();
    await provider.disconnect();

    expect(provider.isConnected()).toBe(false);
  });

  it("handles disconnect when not connected", async () => {
    const provider = new GmailProvider(testConfig);
    await provider.disconnect();
    expect(provider.isConnected()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Listen (polling)
  // -----------------------------------------------------------------------
  it("starts polling for new messages after connect with listener", async () => {
    const provider = new GmailProvider(testConfig);
    const handler = vi.fn();

    await provider.connect();
    provider.listen(handler);

    // Configure mock to return a new message on next poll
    mockGmailApi.users.history.list.mockResolvedValueOnce({
      data: {
        history: [
          {
            messagesAdded: [{ message: { id: "new-msg-1" } }],
          },
        ],
        historyId: "12347",
      },
    });

    // Advance past polling interval
    await vi.advanceTimersByTimeAsync(testConfig.pollingInterval + 100);

    expect(mockGmailApi.users.history.list).toHaveBeenCalled();
  });

  it("queues listeners registered before connect", async () => {
    const provider = new GmailProvider(testConfig);
    const handler = vi.fn();

    provider.listen(handler);
    await provider.connect();

    // Polling should be active. Configure mock with new message.
    mockGmailApi.users.history.list.mockResolvedValueOnce({
      data: {
        history: [
          {
            messagesAdded: [{ message: { id: "new-msg-1" } }],
          },
        ],
        historyId: "12347",
      },
    });

    await vi.advanceTimersByTimeAsync(testConfig.pollingInterval + 100);

    expect(handler).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------
  it("sends email via Gmail API", async () => {
    const provider = new GmailProvider(testConfig);
    await provider.connect();

    const messageId = await provider.send({
      from: "bot@test.com",
      to: "recipient@test.com",
      subject: "Test",
      text: "Hello",
      html: "Hello",
      attachments: [],
    });

    expect(mockGmailApi.users.messages.send).toHaveBeenCalledOnce();
    expect(messageId).toBeDefined();
  });

  it("throws when sending without connection", async () => {
    const provider = new GmailProvider(testConfig);

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
  // Rate limit handling
  // -----------------------------------------------------------------------
  it("retries on 429 rate limit with backoff", async () => {
    const provider = new GmailProvider(testConfig);
    await provider.connect();

    // First call: rate limited, second call: success
    const rateLimitError = new Error("Rate limit exceeded");
    (rateLimitError as { code?: number }).code = 429;

    mockGmailApi.users.messages.send.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
      data: { id: "sent-retry", threadId: "gmail-thread-1" },
    });

    // Start the send (it will hit rate limit, then setTimeout for backoff)
    const sendPromise = provider.send({
      from: "bot@test.com",
      to: "recipient@test.com",
      subject: "Test",
      text: "Hello",
      html: "Hello",
      attachments: [],
    });

    // Advance past the backoff delay (1s base delay for first retry)
    await vi.advanceTimersByTimeAsync(2000);

    const messageId = await sendPromise;

    expect(mockGmailApi.users.messages.send).toHaveBeenCalledTimes(2);
    expect(messageId).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  it("stops polling on disconnect", async () => {
    const provider = new GmailProvider(testConfig);
    const handler = vi.fn();

    await provider.connect();
    provider.listen(handler);
    await provider.disconnect();

    const callsAfterDisconnect = mockGmailApi.users.history.list.mock.calls.length;

    // Advance well past polling interval
    await vi.advanceTimersByTimeAsync(testConfig.pollingInterval * 3);

    expect(mockGmailApi.users.history.list.mock.calls.length).toBe(callsAfterDisconnect);
  });
});
