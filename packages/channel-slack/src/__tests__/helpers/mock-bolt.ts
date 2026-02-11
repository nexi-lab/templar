import { vi } from "vitest";
import type { SlackWebClient } from "../../renderer.js";

// ---------------------------------------------------------------------------
// Captured API call type
// ---------------------------------------------------------------------------

export interface CapturedApiCall {
  readonly method: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mock Slack WebClient
// ---------------------------------------------------------------------------

export function createMockClient(): { client: SlackWebClient; calls: CapturedApiCall[] } {
  const calls: CapturedApiCall[] = [];

  const client: SlackWebClient = {
    chat: {
      postMessage: vi.fn(async (args) => {
        calls.push({ method: "chat.postMessage", payload: args as Record<string, unknown> });
        return { ok: true, ts: "1234567890.123456" };
      }),
    },
    filesUploadV2: vi.fn(async (args) => {
      calls.push({ method: "filesUploadV2", payload: args as Record<string, unknown> });
      return { ok: true };
    }),
  };

  return { client, calls };
}

// ---------------------------------------------------------------------------
// Mock Bolt App
// ---------------------------------------------------------------------------

export interface MockAppInstance {
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly client: SlackWebClient;
  readonly message: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
  readonly messageHandlers: Array<
    (args: { message: unknown; say: unknown; client: SlackWebClient }) => Promise<void>
  >;
  readonly errorHandlers: Array<(args: { error: Error }) => Promise<void>>;
}

export function createMockApp(): MockAppInstance {
  const { client } = createMockClient();
  const messageHandlers: MockAppInstance["messageHandlers"] = [];
  const errorHandlers: MockAppInstance["errorHandlers"] = [];

  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    client,
    message: vi.fn((handler) => {
      messageHandlers.push(handler);
    }),
    error: vi.fn((handler) => {
      errorHandlers.push(handler);
    }),
    messageHandlers,
    errorHandlers,
  };
}
