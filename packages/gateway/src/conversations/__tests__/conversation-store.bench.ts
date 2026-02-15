import { bench, describe } from "vitest";
import { type ConversationKey, resolveConversationKey } from "../../protocol/index.js";
import { ConversationStore } from "../conversation-store.js";

describe("ConversationStore performance", () => {
  bench("resolveConversationKey (per-channel-peer)", () => {
    resolveConversationKey({
      scope: "per-channel-peer",
      agentId: "agent-1",
      channelId: "whatsapp",
      peerId: "peer-42",
      messageType: "dm",
    });
  });

  bench("store.bind() single entry", () => {
    const store = new ConversationStore({
      maxConversations: 100_000,
      conversationTtl: 86_400_000,
    });
    store.bind("agent:a1:whatsapp:dm:p1" as ConversationKey, "node-1");
  });

  const lookupStore = new ConversationStore({
    maxConversations: 200_000,
    conversationTtl: 86_400_000,
  });
  for (let i = 0; i < 100_000; i++) {
    lookupStore.bind(`agent:a1:ch:dm:peer-${i}` as ConversationKey, "node-1");
  }
  bench("store.get() at 100K entries", () => {
    lookupStore.get("agent:a1:ch:dm:peer-50000" as ConversationKey);
  });

  const sweepStore = new ConversationStore({
    maxConversations: 200_000,
    conversationTtl: 60_000,
  });
  const now = 100_000;
  for (let i = 0; i < 90_000; i++) {
    sweepStore.bind(`agent:a1:ch:dm:fresh-${i}` as ConversationKey, "node-1", now);
  }
  for (let i = 0; i < 10_000; i++) {
    sweepStore.bind(`agent:a1:ch:dm:old-${i}` as ConversationKey, "node-1", 1000);
  }
  bench("store.sweep() at 100K entries (10% expired)", () => {
    sweepStore.sweep(now + 60_001);
  });
});
