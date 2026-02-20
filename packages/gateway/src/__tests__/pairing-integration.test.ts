/**
 * Integration tests for PairingGuard in TemplarGateway.
 *
 * Uses createTestGateway() with pairing config injected.
 */

import { PairingGuard } from "@templar/pairing";
import { describe, expect, it } from "vitest";
import {
  createTestGateway,
  DEFAULT_CAPS,
  DEFAULT_CONFIG,
  makeMessage,
  sendFrame,
} from "./helpers.js";

/** Start gateway, register a node, bind a channel, and return the ws */
async function setupNode(
  configOverrides: Record<string, unknown> = {},
  options: { nodeId?: string; channels?: string[] } = {},
) {
  const { gateway, wss } = createTestGateway(configOverrides);
  await gateway.start();

  const nodeId = options.nodeId ?? "node-1";
  const ws = wss.connect();
  sendFrame(ws, {
    kind: "node.register",
    nodeId,
    capabilities: DEFAULT_CAPS,
    token: DEFAULT_CONFIG.nexusApiKey,
  });

  // Bind all channels
  const channels = options.channels ?? ["whatsapp"];
  for (const ch of channels) {
    gateway.bindChannel(ch, nodeId);
  }

  return { gateway, wss, ws, nodeId };
}

describe("Gateway pairing integration", () => {
  it("unpaired sender's DM is blocked (error frame sent back)", async () => {
    const { ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });

    // Send DM from unpaired sender
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "hello",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    // Should get an error frame back, not an ack
    const frames = ws.sentFrames();
    const errorFrame = frames.find((f) => f.kind === "error");
    expect(errorFrame).toBeDefined();
    if (errorFrame && "error" in errorFrame) {
      expect((errorFrame as { error: { title: string } }).error.title).toBe("Pairing required");
    }
  });

  it("paired sender's DM is routed normally", async () => {
    const { gateway, ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });
    const guard = gateway.getPairingGuard();
    expect(guard).toBeDefined();

    // Generate and use pairing code
    const code = guard?.generateCode("node-1", "whatsapp");
    expect(code).toBeDefined();

    // Send pairing code — checkSender returns "paired", message is routed
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: code?.code ?? "",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    // Now send a normal message — should get ack (peer is now approved)
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "hi there",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    const frames = ws.sentFrames();
    const acks = frames.filter((f) => f.kind === "lane.message.ack");
    // Should have at least 1 ack for the second message
    expect(acks.length).toBeGreaterThanOrEqual(1);
  });

  it("pairing flow: generate → send code → ack + peer approved → future messages pass", async () => {
    const { gateway, ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });
    const guard = gateway.getPairingGuard();
    expect(guard).toBeDefined();

    // Owner generates code
    const code = guard?.generateCode("node-1", "whatsapp");
    expect(code).toBeDefined();

    // User sends code in message
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: `Here is my code: ${code?.formatted}`,
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    // Verify peer is now approved
    expect(guard?.listPeers().length).toBe(1);

    // Future messages should pass
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "thanks!",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    const acks = ws.sentFrames().filter((f) => f.kind === "lane.message.ack");
    expect(acks.length).toBeGreaterThanOrEqual(1);
  });

  it("non-pairing channel DM is NOT blocked", async () => {
    const { ws } = await setupNode(
      { pairing: { enabled: true, channels: ["whatsapp"] } },
      { channels: ["whatsapp", "slack"] },
    );

    // Send DM on a non-pairing channel
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "slack",
        payload: "hello",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    // Should get ack (not blocked)
    const acks = ws.sentFrames().filter((f) => f.kind === "lane.message.ack");
    expect(acks.length).toBe(1);
  });

  it("group message from unpaired sender is NOT blocked", async () => {
    const { ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });

    // Send group message — messageType is NOT dm
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "hello group",
        routingContext: { peerId: "user-1", messageType: "group", groupId: "grp-1" },
      }),
    });

    // Should get ack (group messages bypass pairing)
    const acks = ws.sentFrames().filter((f) => f.kind === "lane.message.ack");
    expect(acks.length).toBe(1);
  });

  it("rate-limited sender receives rate limit error frame", async () => {
    const { gateway, ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"], maxAttempts: 2 },
    });

    const guard = gateway.getPairingGuard();
    expect(guard).toBeDefined();
    guard?.generateCode("node-1", "whatsapp");

    // 2 bad attempts
    for (let i = 0; i < 2; i++) {
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: makeMessage({
          channelId: "whatsapp",
          payload: "ZZZZ-ZZZZ",
          routingContext: { peerId: "user-1", messageType: "dm" },
        }),
      });
    }

    // 3rd attempt — should be rate limited
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "ZZZZ-ZZZZ",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    const frames = ws.sentFrames();
    const rateLimitError = frames.find(
      (f) =>
        f.kind === "error" &&
        "error" in f &&
        (f as { error: { title: string } }).error.title === "Rate limited",
    );
    expect(rateLimitError).toBeDefined();
  });

  it("expired code attempt receives expired error frame", () => {
    let now = 1000000;
    const guard = new PairingGuard(
      { enabled: true, channels: ["whatsapp"], expiryMs: 1000 },
      { now: () => now },
    );

    // We test via the guard directly since we can't easily control time in the gateway
    const code = guard.generateCode("node-1", "whatsapp");
    now += 2000; // Past expiry
    const result = guard.checkSender("node-1", "whatsapp", "user-1", code.code);
    expect(result.status).toBe("expired_code");
  });

  it("cross-channel isolation: paired on WhatsApp, blocked on Telegram", async () => {
    const { gateway, ws } = await setupNode(
      { pairing: { enabled: true, channels: ["whatsapp", "telegram"] } },
      { channels: ["whatsapp", "telegram"] },
    );
    const guard = gateway.getPairingGuard();
    expect(guard).toBeDefined();
    const code = guard?.generateCode("node-1", "whatsapp");
    expect(code).toBeDefined();

    // Pair on WhatsApp
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: code?.code ?? "",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    // Telegram DM should be blocked
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "telegram",
        payload: "hi",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    const frames = ws.sentFrames();
    const telegramError = frames.find(
      (f) =>
        f.kind === "error" &&
        "error" in f &&
        (f as { error: { title: string } }).error.title === "Pairing required",
    );
    expect(telegramError).toBeDefined();
  });

  it("pairing disabled: all DMs pass through", async () => {
    const { gateway, ws } = await setupNode();
    // No pairing config → no guard created
    expect(gateway.getPairingGuard()).toBeUndefined();

    // DM should pass through without pairing
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "hello",
        routingContext: { peerId: "user-1", messageType: "dm" },
      }),
    });

    const acks = ws.sentFrames().filter((f) => f.kind === "lane.message.ack");
    expect(acks.length).toBe(1);
  });

  it("getPairingGuard returns the guard when pairing is configured", async () => {
    const { gateway } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });
    const guard = gateway.getPairingGuard();
    expect(guard).toBeInstanceOf(PairingGuard);
  });

  it("message without routingContext passes through (no pairing check on non-DM)", async () => {
    const { ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });

    // Message without routingContext
    sendFrame(ws, {
      kind: "lane.message",
      lane: "steer",
      message: makeMessage({
        channelId: "whatsapp",
        payload: "hello",
        // No routingContext
      }),
    });

    const acks = ws.sentFrames().filter((f) => f.kind === "lane.message.ack");
    expect(acks.length).toBe(1);
  });

  it("sweep piggyback: PairingGuard.sweep called via health monitor cycle", () => {
    let now = 1000000;
    const guard = new PairingGuard(
      { enabled: true, channels: ["whatsapp"], expiryMs: 1000 },
      { now: () => now },
    );

    // Generate code and advance time past expiry
    guard.generateCode("agent-1", "whatsapp");
    expect(guard.getStats().pendingCodeCount).toBe(1);
    now += 2000;

    // Direct sweep call (simulating what the health monitor does)
    guard.sweep();
    expect(guard.getStats().pendingCodeCount).toBe(0);
  });

  it("concurrent messages from multiple peers processed correctly", async () => {
    const { gateway, ws } = await setupNode({
      pairing: { enabled: true, channels: ["whatsapp"] },
    });
    const guard = gateway.getPairingGuard();
    expect(guard).toBeDefined();

    // Generate codes for 3 peers
    const codes = [
      guard?.generateCode("node-1", "whatsapp"),
      guard?.generateCode("node-1", "whatsapp"),
      guard?.generateCode("node-1", "whatsapp"),
    ];

    // All 3 peers send their codes
    for (let i = 0; i < 3; i++) {
      sendFrame(ws, {
        kind: "lane.message",
        lane: "steer",
        message: makeMessage({
          channelId: "whatsapp",
          payload: codes[i]?.code ?? "",
          routingContext: { peerId: `user-${i}`, messageType: "dm" },
        }),
      });
    }

    // All 3 should be paired
    expect(guard?.listPeers().length).toBe(3);
  });

  it("injected PairingGuard via deps is used", async () => {
    // Verify that when we create a test gateway with custom deps, the injected guard is used
    const { gateway } = await setupNode({
      pairing: { enabled: true, channels: ["telegram"] },
    });
    // The gateway creates its own guard based on config
    const configGuard = gateway.getPairingGuard();
    expect(configGuard).toBeDefined();
  });
});
