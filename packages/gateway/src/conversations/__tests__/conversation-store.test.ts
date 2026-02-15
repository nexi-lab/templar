import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationKey } from "../../protocol/index.js";
import { ConversationStore } from "../conversation-store.js";

function key(s: string): ConversationKey {
  return s as ConversationKey;
}

describe("ConversationStore", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore({
      maxConversations: 100,
      conversationTtl: 60_000,
    });
  });

  // -------------------------------------------------------------------------
  // Binding CRUD
  // -------------------------------------------------------------------------

  describe("bind and get", () => {
    it("binds a conversation to a node", () => {
      const binding = store.bind(key("conv-1"), "node-a");
      expect(binding.conversationKey).toBe("conv-1");
      expect(binding.nodeId).toBe("node-a");
      expect(binding.createdAt).toBeGreaterThan(0);
      expect(binding.lastActiveAt).toBeGreaterThan(0);
    });

    it("retrieves a bound conversation", () => {
      store.bind(key("conv-1"), "node-a");
      const result = store.get(key("conv-1"));
      expect(result).toBeDefined();
      expect(result?.nodeId).toBe("node-a");
    });

    it("returns undefined for unbound key", () => {
      expect(store.get(key("unknown"))).toBeUndefined();
    });

    it("updates lastActiveAt on re-bind to same node", () => {
      const b1 = store.bind(key("conv-1"), "node-a", 1000);
      const b2 = store.bind(key("conv-1"), "node-a", 2000);
      expect(b2.lastActiveAt).toBe(2000);
      expect(b2.createdAt).toBe(b1.createdAt);
    });

    it("updates nodeId on re-bind to different node", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-1"), "node-b");
      expect(store.get(key("conv-1"))?.nodeId).toBe("node-b");
    });

    it("preserves createdAt on re-bind", () => {
      store.bind(key("conv-1"), "node-a", 1000);
      store.bind(key("conv-1"), "node-b", 2000);
      expect(store.get(key("conv-1"))?.createdAt).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // Size tracking
  // -------------------------------------------------------------------------

  describe("size", () => {
    it("starts at 0", () => {
      expect(store.size).toBe(0);
    });

    it("increments on new bindings", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-2"), "node-a");
      expect(store.size).toBe(2);
    });

    it("does not increment on re-bind", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-1"), "node-a");
      expect(store.size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Node removal (cascade via reverse index)
  // -------------------------------------------------------------------------

  describe("removeNode", () => {
    it("removes all bindings for a node", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-2"), "node-a");
      store.bind(key("conv-3"), "node-b");

      const removed = store.removeNode("node-a");
      expect(removed).toBe(2);
      expect(store.size).toBe(1);
      expect(store.get(key("conv-1"))).toBeUndefined();
      expect(store.get(key("conv-2"))).toBeUndefined();
      expect(store.get(key("conv-3"))).toBeDefined();
    });

    it("returns 0 for unknown node", () => {
      expect(store.removeNode("unknown")).toBe(0);
    });

    it("handles re-bind to different node before removal", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-1"), "node-b");
      const removed = store.removeNode("node-a");
      expect(removed).toBe(0);
      expect(store.get(key("conv-1"))?.nodeId).toBe("node-b");
    });
  });

  // -------------------------------------------------------------------------
  // TTL sweep
  // -------------------------------------------------------------------------

  describe("sweep", () => {
    it("removes expired bindings", () => {
      store.bind(key("old"), "node-a", 1000);
      store.bind(key("new"), "node-a", 100_000);

      const swept = store.sweep(100_000);
      expect(swept).toBe(1);
      expect(store.get(key("old"))).toBeUndefined();
      expect(store.get(key("new"))).toBeDefined();
    });

    it("returns 0 when nothing expired", () => {
      store.bind(key("conv-1"), "node-a", 50_000);
      expect(store.sweep(60_000)).toBe(0);
    });

    it("sweeps all expired bindings", () => {
      store.bind(key("a"), "node-a", 100);
      store.bind(key("b"), "node-a", 200);
      store.bind(key("c"), "node-a", 300);

      const swept = store.sweep(61_000);
      expect(swept).toBe(3);
      expect(store.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Capacity eviction
  // -------------------------------------------------------------------------

  describe("max capacity eviction", () => {
    it("evicts oldest binding when at capacity", () => {
      const smallStore = new ConversationStore({
        maxConversations: 3,
        conversationTtl: 60_000,
      });

      smallStore.bind(key("oldest"), "node-a", 1000);
      smallStore.bind(key("middle"), "node-a", 2000);
      smallStore.bind(key("newest"), "node-a", 3000);

      // This should evict "oldest"
      smallStore.bind(key("overflow"), "node-a", 4000);

      expect(smallStore.size).toBe(3);
      expect(smallStore.get(key("oldest"))).toBeUndefined();
      expect(smallStore.get(key("middle"))).toBeDefined();
      expect(smallStore.get(key("overflow"))).toBeDefined();
    });

    it("does not evict when re-binding existing key at capacity", () => {
      const smallStore = new ConversationStore({
        maxConversations: 2,
        conversationTtl: 60_000,
      });

      smallStore.bind(key("a"), "node-a", 1000);
      smallStore.bind(key("b"), "node-a", 2000);
      smallStore.bind(key("a"), "node-a", 3000); // re-bind, not new

      expect(smallStore.size).toBe(2);
      expect(smallStore.get(key("a"))?.lastActiveAt).toBe(3000);
    });
  });

  // -------------------------------------------------------------------------
  // Clear
  // -------------------------------------------------------------------------

  describe("clear", () => {
    it("removes all bindings", () => {
      store.bind(key("conv-1"), "node-a");
      store.bind(key("conv-2"), "node-b");
      store.clear();
      expect(store.size).toBe(0);
      expect(store.get(key("conv-1"))).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Config update
  // -------------------------------------------------------------------------

  describe("updateConfig", () => {
    it("applies new config values", () => {
      const smallStore = new ConversationStore({
        maxConversations: 2,
        conversationTtl: 60_000,
      });

      smallStore.bind(key("a"), "node-a");
      smallStore.bind(key("b"), "node-a");

      // Expand capacity
      smallStore.updateConfig({ maxConversations: 10, conversationTtl: 60_000 });
      smallStore.bind(key("c"), "node-a");

      expect(smallStore.size).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotent bind
  // -------------------------------------------------------------------------

  describe("concurrent bind for same key", () => {
    it("is idempotent — last bind wins", () => {
      store.bind(key("conv-1"), "node-a", 1000);
      store.bind(key("conv-1"), "node-b", 2000);
      store.bind(key("conv-1"), "node-a", 3000);

      expect(store.get(key("conv-1"))?.nodeId).toBe("node-a");
      expect(store.get(key("conv-1"))?.lastActiveAt).toBe(3000);
      expect(store.size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Immutable pattern verification
  // -------------------------------------------------------------------------

  describe("immutability", () => {
    it("bind returns a new binding object", () => {
      const b1 = store.bind(key("conv-1"), "node-a", 1000);
      const b2 = store.bind(key("conv-1"), "node-a", 2000);
      expect(b1).not.toBe(b2);
      expect(b1.lastActiveAt).toBe(1000);
      expect(b2.lastActiveAt).toBe(2000);
    });
  });
});
