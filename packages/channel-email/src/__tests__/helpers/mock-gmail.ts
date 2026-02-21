import { vi } from "vitest";

/**
 * Mock Gmail API client for testing.
 */
export interface MockGmailApi {
  users: {
    messages: {
      list: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    };
    history: {
      list: ReturnType<typeof vi.fn>;
    };
    getProfile: ReturnType<typeof vi.fn>;
  };
}

export function createMockGmailApi(): MockGmailApi {
  return {
    users: {
      messages: {
        list: vi.fn().mockResolvedValue({
          data: {
            messages: [],
            resultSizeEstimate: 0,
          },
        }),
        get: vi.fn().mockResolvedValue({
          data: {
            id: "gmail-msg-1",
            threadId: "gmail-thread-1",
            historyId: "12345",
            payload: {
              headers: [
                { name: "From", value: "sender@test.com" },
                { name: "To", value: "bot@test.com" },
                { name: "Subject", value: "Test" },
                { name: "Date", value: "Thu, 15 Jan 2026 10:00:00 +0000" },
                { name: "Message-ID", value: "<gmail-msg-1@test.com>" },
              ],
              mimeType: "text/plain",
              body: {
                data: Buffer.from("Hello from Gmail").toString("base64url"),
              },
            },
          },
        }),
        send: vi.fn().mockResolvedValue({
          data: {
            id: "sent-gmail-1",
            threadId: "gmail-thread-1",
            labelIds: ["SENT"],
          },
        }),
      },
      history: {
        list: vi.fn().mockResolvedValue({
          data: {
            history: [],
            historyId: "12346",
          },
        }),
      },
      getProfile: vi.fn().mockResolvedValue({
        data: {
          emailAddress: "bot@test.com",
          historyId: "12345",
        },
      }),
    },
  };
}
