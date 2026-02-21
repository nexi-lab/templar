import { describe, expect, it } from "vitest";
import { checkInvariants } from "../checkpoint/invariant-checker.js";
import type { ConversationStoreSnapshot } from "../conversations/conversation-snapshot.js";
import type { DeliveryTrackerSnapshot } from "../delivery-snapshot.js";
import type { ConversationKey, SessionInfo } from "../protocol/index.js";
import type { SessionManagerSnapshot } from "../sessions/session-snapshot.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = Date.now();

function makeSession(nodeId: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: `session-${nodeId}`,
    nodeId,
    state: "connected",
    connectedAt: now - 10_000,
    lastActivityAt: now,
    reconnectCount: 0,
    ...overrides,
  };
}

function makeSessionSnap(sessions: SessionInfo[]): SessionManagerSnapshot {
  return { version: 1, sessions, capturedAt: now };
}

function makeConvSnap(
  bindings: {
    conversationKey: string;
    nodeId: string;
    createdAt?: number;
    lastActiveAt?: number;
  }[],
): ConversationStoreSnapshot {
  return {
    version: 1,
    bindings: bindings.map((b) => ({
      conversationKey: b.conversationKey as ConversationKey,
      nodeId: b.nodeId,
      createdAt: b.createdAt ?? now - 5000,
      lastActiveAt: b.lastActiveAt ?? now,
    })),
    capturedAt: now,
  };
}

function makeDeliverySnap(
  pending: Record<string, { messageId: string }[]> = {},
): DeliveryTrackerSnapshot {
  const mapped: Record<
    string,
    {
      messageId: string;
      nodeId: string;
      sentAt: number;
      message: { id: string; lane: "steer"; channelId: string; payload: null; timestamp: number };
    }[]
  > = {};
  for (const [nodeId, msgs] of Object.entries(pending)) {
    mapped[nodeId] = msgs.map((m) => ({
      messageId: m.messageId,
      nodeId,
      sentAt: now,
      message: { id: m.messageId, lane: "steer", channelId: "ch-1", payload: null, timestamp: now },
    }));
  }
  return { version: 1, pending: mapped, capturedAt: now };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkInvariants", () => {
  it("valid state passes all invariants", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1"), makeSession("node-2")]),
      makeConvSnap([{ conversationKey: "conv-1", nodeId: "node-1" }]),
      makeDeliverySnap({ "node-1": [{ messageId: "msg-1" }] }),
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("empty state passes", () => {
    const result = checkInvariants(makeSessionSnap([]), makeConvSnap([]), makeDeliverySnap());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("orphaned conversation binding → error", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1")]),
      makeConvSnap([{ conversationKey: "conv-orphan", nodeId: "dead-node" }]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.rule).toBe("conversation-orphan");
    expect(result.violations[0]?.severity).toBe("error");
  });

  it("orphaned delivery entry → error", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1")]),
      makeConvSnap([]),
      makeDeliverySnap({ "dead-node": [{ messageId: "msg-1" }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.rule).toBe("delivery-orphan");
    expect(result.violations[0]?.severity).toBe("error");
  });

  it("disconnected session in snapshot → warning (not error)", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1", { state: "disconnected" })]),
      makeConvSnap([]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.rule).toBe("disconnected-session");
    expect(result.violations[0]?.severity).toBe("warning");
  });

  it("session timestamp inversion (connectedAt > lastActivityAt) → error", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1", { connectedAt: now, lastActivityAt: now - 10_000 })]),
      makeConvSnap([]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === "session-timestamp-inversion")).toBe(true);
  });

  it("conversation timestamp inversion (createdAt > lastActiveAt) → error", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1")]),
      makeConvSnap([
        { conversationKey: "conv-1", nodeId: "node-1", createdAt: now, lastActiveAt: now - 5000 },
      ]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === "conversation-timestamp-inversion")).toBe(true);
  });

  it("duplicate session nodeIds → error", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1"), makeSession("node-1")]),
      makeConvSnap([]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === "duplicate-session")).toBe(true);
  });

  it("multiple violations reported simultaneously", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1", { connectedAt: now, lastActivityAt: now - 1000 })]),
      makeConvSnap([{ conversationKey: "conv-1", nodeId: "dead-node" }]),
      makeDeliverySnap({ "dead-node": [{ messageId: "msg-1" }] }),
    );
    expect(result.valid).toBe(false);
    // At least 3: session timestamp inversion, orphaned conversation, orphaned delivery
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it("warnings don't cause valid=false", () => {
    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1"), makeSession("node-2", { state: "disconnected" })]),
      makeConvSnap([{ conversationKey: "conv-1", nodeId: "node-1" }]),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.every((v) => v.severity === "warning")).toBe(true);
  });

  it("large valid state passes", () => {
    const sessions: SessionInfo[] = [];
    for (let i = 0; i < 100; i++) {
      sessions.push(makeSession(`node-${i}`));
    }
    const bindings: { conversationKey: string; nodeId: string }[] = [];
    for (let i = 0; i < 1000; i++) {
      bindings.push({ conversationKey: `conv-${i}`, nodeId: `node-${i % 100}` });
    }
    const result = checkInvariants(
      makeSessionSnap(sessions),
      makeConvSnap(bindings),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(true);
  });

  it("partial corruption detected among valid data", () => {
    const bindings: { conversationKey: string; nodeId: string }[] = [];
    for (let i = 0; i < 100; i++) {
      bindings.push({ conversationKey: `conv-${i}`, nodeId: "node-1" });
    }
    // Add one bad binding referencing a dead node
    bindings.push({ conversationKey: "conv-bad", nodeId: "dead-node" });

    const result = checkInvariants(
      makeSessionSnap([makeSession("node-1")]),
      makeConvSnap(bindings),
      makeDeliverySnap(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.rule).toBe("conversation-orphan");
  });
});
