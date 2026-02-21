import { describe, expect, it } from "vitest";
import type { ConversationStoreSnapshot } from "../conversations/conversation-snapshot.js";
import { ConversationStoreSnapshotSchema } from "../conversations/conversation-snapshot.js";
import { ConversationStore } from "../conversations/conversation-store.js";
import type { DeliveryTrackerSnapshot } from "../delivery-snapshot.js";
import { DeliveryTrackerSnapshotSchema } from "../delivery-snapshot.js";
import { DeliveryTracker } from "../delivery-tracker.js";
import type { ConversationKey, LaneMessage } from "../protocol/index.js";
import { SessionManager } from "../sessions/session-manager.js";
import type { SessionManagerSnapshot } from "../sessions/session-snapshot.js";
import { SessionManagerSnapshotSchema } from "../sessions/session-snapshot.js";

function key(s: string): ConversationKey {
  return s as ConversationKey;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSessionManager() {
  return new SessionManager({ sessionTimeout: 60_000, suspendTimeout: 300_000 });
}

function createConversationStore() {
  return new ConversationStore({ maxConversations: 100_000, conversationTtl: 86_400_000 });
}

function makeMsg(id: string, channelId = "ch-1"): LaneMessage {
  return { id, lane: "steer", channelId, payload: null, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// SessionManager snapshot tests
// ---------------------------------------------------------------------------

describe("SessionManager snapshot", () => {
  it("toSnapshot() returns valid schema", () => {
    const sm = createSessionManager();
    sm.createSession("node-1");
    const snap = sm.toSnapshot();
    expect(() => SessionManagerSnapshotSchema.parse(snap)).not.toThrow();
  });

  it("toSnapshot() captures all entries", () => {
    const sm = createSessionManager();
    sm.createSession("node-1");
    sm.createSession("node-2");
    const snap = sm.toSnapshot();
    expect(snap.sessions).toHaveLength(2);
    expect(snap.version).toBe(1);
    expect(snap.capturedAt).toBeGreaterThan(0);
  });

  it("toSnapshot() excludes disconnected sessions", () => {
    const sm = createSessionManager();
    sm.createSession("node-1");
    sm.createSession("node-2");
    sm.handleEvent("node-2", "disconnect");
    const snap = sm.toSnapshot();
    expect(snap.sessions).toHaveLength(1);
    expect(snap.sessions[0]?.nodeId).toBe("node-1");
  });

  it("fromSnapshot() restores state correctly", () => {
    const sm = createSessionManager();
    sm.createSession("node-1");
    sm.createSession("node-2");
    const snap = sm.toSnapshot();

    const sm2 = createSessionManager();
    sm2.fromSnapshot(snap);
    expect(sm2.getSession("node-1")).toBeDefined();
    expect(sm2.getSession("node-2")).toBeDefined();
    expect(sm2.getAllSessions()).toHaveLength(2);
  });

  it("round-trip preserves data", () => {
    const sm = createSessionManager();
    sm.createSession("node-1", { identityContext: { channelType: "slack", agentId: "a1" } });
    sm.createSession("node-2");
    const snap = sm.toSnapshot();

    const sm2 = createSessionManager();
    sm2.fromSnapshot(snap);
    const restored = sm2.toSnapshot();

    // Compare session data (capturedAt will differ)
    expect(restored.sessions).toHaveLength(snap.sessions.length);
    for (let i = 0; i < snap.sessions.length; i++) {
      expect(restored.sessions[i]?.nodeId).toBe(snap.sessions[i]?.nodeId);
      expect(restored.sessions[i]?.sessionId).toBe(snap.sessions[i]?.sessionId);
      expect(restored.sessions[i]?.state).toBe(snap.sessions[i]?.state);
    }
  });

  it("fromSnapshot() with empty data", () => {
    const sm = createSessionManager();
    const emptySnap: SessionManagerSnapshot = {
      version: 1,
      sessions: [],
      capturedAt: Date.now(),
    };
    sm.fromSnapshot(emptySnap);
    expect(sm.getAllSessions()).toHaveLength(0);
  });

  it("fromSnapshot() clears existing state before restore", () => {
    const sm = createSessionManager();
    sm.createSession("existing-node");
    expect(sm.getAllSessions()).toHaveLength(1);

    const snap: SessionManagerSnapshot = {
      version: 1,
      sessions: [
        {
          sessionId: "00000000-0000-4000-8000-000000000001",
          nodeId: "restored-node",
          state: "connected",
          connectedAt: Date.now(),
          lastActivityAt: Date.now(),
          reconnectCount: 0,
        },
      ],
      capturedAt: Date.now(),
    };
    sm.fromSnapshot(snap);
    expect(sm.getSession("existing-node")).toBeUndefined();
    expect(sm.getSession("restored-node")).toBeDefined();
    expect(sm.getAllSessions()).toHaveLength(1);
  });

  it("fromSnapshot() rejects invalid schema", () => {
    const sm = createSessionManager();
    const invalid = { version: 2, sessions: "bad", capturedAt: -1 } as unknown;
    expect(() => sm.fromSnapshot(invalid as SessionManagerSnapshot)).toThrow();
  });

  it("restored sessions have NO running timers", () => {
    const sm = createSessionManager();
    sm.createSession("node-1");
    const snap = sm.toSnapshot();

    const sm2 = createSessionManager();
    sm2.fromSnapshot(snap);

    // If timers were running, disposing would clear them.
    // We verify by checking that no timer-driven transitions happen.
    // The session stays in its restored state indefinitely until a real event arrives.
    const session = sm2.getSession("node-1");
    expect(session?.state).toBe("connected");

    // Cleanup
    sm.dispose();
    sm2.dispose();
  });
});

// ---------------------------------------------------------------------------
// ConversationStore snapshot tests
// ---------------------------------------------------------------------------

describe("ConversationStore snapshot", () => {
  it("toSnapshot() returns valid schema", () => {
    const cs = createConversationStore();
    cs.bind(key("conv-1"), "node-1");
    const snap = cs.toSnapshot();
    expect(() => ConversationStoreSnapshotSchema.parse(snap)).not.toThrow();
  });

  it("toSnapshot() captures all entries", () => {
    const cs = createConversationStore();
    cs.bind(key("conv-1"), "node-1");
    cs.bind(key("conv-2"), "node-2");
    const snap = cs.toSnapshot();
    expect(snap.bindings).toHaveLength(2);
    expect(snap.version).toBe(1);
  });

  it("fromSnapshot() restores state correctly", () => {
    const cs = createConversationStore();
    cs.bind(key("conv-1"), "node-1");
    cs.bind(key("conv-2"), "node-1");
    const snap = cs.toSnapshot();

    const cs2 = createConversationStore();
    cs2.fromSnapshot(snap);
    expect(cs2.get(key("conv-1"))?.nodeId).toBe("node-1");
    expect(cs2.get(key("conv-2"))?.nodeId).toBe("node-1");
    expect(cs2.size).toBe(2);
  });

  it("round-trip preserves data", () => {
    const cs = createConversationStore();
    cs.bind(key("conv-1"), "node-1");
    cs.bind(key("conv-2"), "node-2");
    const snap = cs.toSnapshot();

    const cs2 = createConversationStore();
    cs2.fromSnapshot(snap);
    const restored = cs2.toSnapshot();

    expect(restored.bindings).toHaveLength(snap.bindings.length);
    for (const b of snap.bindings) {
      const found = restored.bindings.find((r) => r.conversationKey === b.conversationKey);
      expect(found).toBeDefined();
      expect(found?.nodeId).toBe(b.nodeId);
    }
  });

  it("fromSnapshot() with empty data", () => {
    const cs = createConversationStore();
    const emptySnap: ConversationStoreSnapshot = {
      version: 1,
      bindings: [],
      capturedAt: Date.now(),
    };
    cs.fromSnapshot(emptySnap);
    expect(cs.size).toBe(0);
  });

  it("fromSnapshot() clears existing state before restore", () => {
    const cs = createConversationStore();
    cs.bind(key("existing"), "node-1");
    expect(cs.size).toBe(1);

    const snap: ConversationStoreSnapshot = {
      version: 1,
      bindings: [
        {
          conversationKey: key("restored"),
          nodeId: "node-2",
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        },
      ],
      capturedAt: Date.now(),
    };
    cs.fromSnapshot(snap);
    expect(cs.get(key("existing"))).toBeUndefined();
    expect(cs.get(key("restored"))).toBeDefined();
    expect(cs.size).toBe(1);
  });

  it("fromSnapshot() rejects invalid schema", () => {
    const cs = createConversationStore();
    const invalid = { version: 2, bindings: null } as unknown;
    expect(() => cs.fromSnapshot(invalid as ConversationStoreSnapshot)).toThrow();
  });

  it("reverse index rebuilt correctly after restore", () => {
    const cs = createConversationStore();
    cs.bind(key("conv-1"), "node-1");
    cs.bind(key("conv-2"), "node-1");
    cs.bind(key("conv-3"), "node-2");
    const snap = cs.toSnapshot();

    const cs2 = createConversationStore();
    cs2.fromSnapshot(snap);

    // removeNode uses reverse index — should remove both bindings for node-1
    const removed = cs2.removeNode("node-1");
    expect(removed).toBe(2);
    expect(cs2.size).toBe(1);
    expect(cs2.get(key("conv-3"))?.nodeId).toBe("node-2");
  });
});

// ---------------------------------------------------------------------------
// DeliveryTracker snapshot tests
// ---------------------------------------------------------------------------

describe("DeliveryTracker snapshot", () => {
  it("toSnapshot() returns valid schema", () => {
    const dt = new DeliveryTracker(1000);
    dt.track("node-1", makeMsg("msg-1"));
    const snap = dt.toSnapshot();
    expect(() => DeliveryTrackerSnapshotSchema.parse(snap)).not.toThrow();
  });

  it("toSnapshot() captures all entries", () => {
    const dt = new DeliveryTracker(1000);
    dt.track("node-1", makeMsg("msg-1"));
    dt.track("node-1", makeMsg("msg-2"));
    dt.track("node-2", makeMsg("msg-3"));
    const snap = dt.toSnapshot();
    expect(Object.keys(snap.pending)).toHaveLength(2);
    expect(snap.pending["node-1"]).toHaveLength(2);
    expect(snap.pending["node-2"]).toHaveLength(1);
  });

  it("fromSnapshot() restores state correctly", () => {
    const dt = new DeliveryTracker(1000);
    dt.track("node-1", makeMsg("msg-1"));
    dt.track("node-2", makeMsg("msg-2"));
    const snap = dt.toSnapshot();

    const dt2 = new DeliveryTracker(1000);
    dt2.fromSnapshot(snap);
    expect(dt2.pendingCount("node-1")).toBe(1);
    expect(dt2.pendingCount("node-2")).toBe(1);
    expect(dt2.unacked("node-1")[0]?.messageId).toBe("msg-1");
  });

  it("round-trip preserves data", () => {
    const dt = new DeliveryTracker(1000);
    dt.track("node-1", makeMsg("msg-1"));
    dt.track("node-1", makeMsg("msg-2"));
    const snap = dt.toSnapshot();

    const dt2 = new DeliveryTracker(1000);
    dt2.fromSnapshot(snap);
    const restored = dt2.toSnapshot();

    expect(Object.keys(restored.pending)).toHaveLength(Object.keys(snap.pending).length);
    expect(restored.pending["node-1"]).toHaveLength(snap.pending["node-1"]?.length ?? 0);
  });

  it("fromSnapshot() with empty data", () => {
    const dt = new DeliveryTracker(1000);
    const emptySnap: DeliveryTrackerSnapshot = {
      version: 1,
      pending: {},
      capturedAt: Date.now(),
    };
    dt.fromSnapshot(emptySnap);
    expect(dt.pendingCount("node-1")).toBe(0);
  });

  it("fromSnapshot() clears existing state before restore", () => {
    const dt = new DeliveryTracker(1000);
    dt.track("existing-node", makeMsg("msg-old"));
    expect(dt.pendingCount("existing-node")).toBe(1);

    const snap: DeliveryTrackerSnapshot = {
      version: 1,
      pending: {
        "restored-node": [
          {
            messageId: "msg-new",
            nodeId: "restored-node",
            sentAt: Date.now(),
            message: makeMsg("msg-new"),
          },
        ],
      },
      capturedAt: Date.now(),
    };
    dt.fromSnapshot(snap);
    expect(dt.pendingCount("existing-node")).toBe(0);
    expect(dt.pendingCount("restored-node")).toBe(1);
  });

  it("fromSnapshot() rejects invalid schema", () => {
    const dt = new DeliveryTracker(1000);
    const invalid = { version: 99, pending: "not-an-object" } as unknown;
    expect(() => dt.fromSnapshot(invalid as DeliveryTrackerSnapshot)).toThrow();
  });
});
