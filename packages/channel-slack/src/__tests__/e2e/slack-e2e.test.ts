/**
 * E2E test skeleton for @templar/channel-slack.
 *
 * Requires real Slack credentials. Set these environment variables:
 *
 *   SLACK_BOT_TOKEN   — Bot user OAuth token (xoxb-...)
 *   SLACK_APP_TOKEN   — App-level token for Socket Mode (xapp-...)
 *   SLACK_TEST_CHANNEL — Channel ID to send test messages to (e.g. C0123456789)
 *
 * Run:
 *   SLACK_BOT_TOKEN=xoxb-... SLACK_APP_TOKEN=xapp-... SLACK_TEST_CHANNEL=C0... \
 *     pnpm --filter @templar/channel-slack vitest run src/__tests__/e2e
 *
 * All tests are skipped when credentials are missing (safe for CI).
 */
import type { InboundMessage, OutboundMessage } from "@templar/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SlackChannel } from "../../adapter.js";
import { SLACK_CAPABILITIES } from "../../capabilities.js";

// ---------------------------------------------------------------------------
// Credential gate — skip all tests when env vars are absent
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "";
const APP_TOKEN = process.env.SLACK_APP_TOKEN ?? "";
const TEST_CHANNEL = process.env.SLACK_TEST_CHANNEL ?? "";

const HAS_CREDENTIALS = BOT_TOKEN.length > 0 && APP_TOKEN.length > 0 && TEST_CHANNEL.length > 0;

const describeE2E = HAS_CREDENTIALS ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeE2E("Slack E2E (live credentials)", () => {
  let adapter: SlackChannel;

  beforeAll(async () => {
    adapter = new SlackChannel({
      mode: "socket",
      token: BOT_TOKEN,
      appToken: APP_TOKEN,
    });
    await adapter.connect();
  }, 30_000);

  afterAll(async () => {
    await adapter.disconnect();
  }, 10_000);

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  it("connects successfully and exposes capabilities", () => {
    expect(adapter.name).toBe("slack");
    expect(adapter.capabilities).toBe(SLACK_CAPABILITIES);
    expect(adapter.getApp()).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Send: plain text
  // -----------------------------------------------------------------------

  it("sends a plain text message", async () => {
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [{ type: "text", content: `[E2E] Plain text — ${new Date().toISOString()}` }],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Send: rich text (mrkdwn conversion)
  // -----------------------------------------------------------------------

  it("sends a rich text message with formatting", async () => {
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [
        {
          type: "text",
          content: `[E2E] **Bold**, ~~strike~~, [link](https://example.com) — ${new Date().toISOString()}`,
        },
      ],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Send: image
  // -----------------------------------------------------------------------

  it("sends an image block", async () => {
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [
        {
          type: "image",
          url: "https://via.placeholder.com/150",
          alt: "E2E test placeholder",
        },
      ],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Send: buttons
  // -----------------------------------------------------------------------

  it("sends a message with buttons", async () => {
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [
        { type: "text", content: "[E2E] Choose an option:" },
        {
          type: "button",
          buttons: [
            { label: "Option A", action: "e2e_opt_a" },
            { label: "Option B", action: "e2e_opt_b", style: "danger" },
          ],
        },
      ],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Send: mixed content (text + image + buttons in one batch)
  // -----------------------------------------------------------------------

  it("sends a batched message with text, image, and buttons", async () => {
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [
        { type: "text", content: "[E2E] Batched message:" },
        {
          type: "image",
          url: "https://via.placeholder.com/100",
          alt: "batch test",
        },
        {
          type: "button",
          buttons: [{ label: "Confirm", action: "e2e_confirm", style: "primary" }],
        },
      ],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Send: file upload
  // -----------------------------------------------------------------------

  it("sends a file upload", async () => {
    // Uses a publicly accessible small file
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [
        {
          type: "file",
          url: "https://via.placeholder.com/50.png",
          filename: "e2e-test.png",
          mimeType: "image/png",
        },
      ],
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  }, 15_000);

  // -----------------------------------------------------------------------
  // Send: threaded message
  // -----------------------------------------------------------------------

  it("sends a threaded reply (requires a known thread_ts)", async () => {
    // Step 1: Send a parent message
    const parentMessage: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [{ type: "text", content: `[E2E] Thread parent — ${new Date().toISOString()}` }],
    };
    await adapter.send(parentMessage);

    // Note: To test threading properly, you'd need to capture the ts from
    // the postMessage response. Since our adapter doesn't return ts,
    // this test sends a threadId that may not exist — Slack treats it
    // as a new message (no error). A full test would require extending
    // the adapter to return message metadata.
    //
    // TODO: When adapter.send() returns message metadata, replace with:
    //   const result = await adapter.send(parentMessage);
    //   const threadTs = result.ts;
    const message: OutboundMessage = {
      channelId: TEST_CHANNEL,
      blocks: [{ type: "text", content: "[E2E] Thread reply" }],
      threadId: "0000000000.000000", // placeholder — replace with real ts
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Receive: inbound message (manual verification)
  // -----------------------------------------------------------------------

  it("registers onMessage handler without error", () => {
    const received: InboundMessage[] = [];

    // Register handler — does not throw
    adapter.onMessage((msg) => {
      received.push(msg);
    });

    // Note: Verifying actual inbound messages requires someone to type
    // in the Slack channel while this test runs. For automated E2E,
    // consider using a second bot to send a message and verify receipt.
    //
    // TODO: Automate with a sender bot:
    //   await senderBot.chat.postMessage({ channel: TEST_CHANNEL, text: "ping" });
    //   await waitFor(() => received.length > 0, { timeout: 5000 });
    //   expect(received[0].blocks[0]).toEqual({ type: "text", content: "ping" });

    expect(received).toHaveLength(0); // no messages yet (no sender)
  });

  // -----------------------------------------------------------------------
  // Idempotent disconnect
  // -----------------------------------------------------------------------

  it("disconnect is idempotent", async () => {
    // Will be called again in afterAll — should not throw
    await adapter.disconnect();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
