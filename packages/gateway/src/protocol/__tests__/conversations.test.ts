import { describe, expect, it } from "vitest";
import {
  CONVERSATION_SCOPES,
  type ConversationKey,
  type ConversationKeyInput,
  ConversationScopeSchema,
  MESSAGE_TYPES,
  MessageRoutingContextSchema,
  MessageTypeSchema,
  parseConversationKey,
  resolveConversationKey,
} from "../conversations.js";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("ConversationScopeSchema", () => {
  it.each(CONVERSATION_SCOPES)("accepts '%s'", (scope) => {
    expect(ConversationScopeSchema.parse(scope)).toBe(scope);
  });

  it("rejects invalid scope", () => {
    expect(() => ConversationScopeSchema.parse("invalid")).toThrow();
  });
});

describe("MessageTypeSchema", () => {
  it.each(MESSAGE_TYPES)("accepts '%s'", (type) => {
    expect(MessageTypeSchema.parse(type)).toBe(type);
  });
});

describe("MessageRoutingContextSchema", () => {
  it("accepts full context", () => {
    const result = MessageRoutingContextSchema.parse({
      peerId: "peer-1",
      accountId: "acc-1",
      groupId: "grp-1",
      messageType: "dm",
    });
    expect(result.peerId).toBe("peer-1");
  });

  it("accepts empty context", () => {
    const result = MessageRoutingContextSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects empty string peerId", () => {
    expect(() => MessageRoutingContextSchema.parse({ peerId: "" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveConversationKey
// ---------------------------------------------------------------------------

describe("resolveConversationKey()", () => {
  const base: ConversationKeyInput = {
    scope: "main",
    agentId: "a1",
    channelId: "whatsapp",
  };

  describe("DM scoping", () => {
    it.each([
      {
        desc: "main scope",
        input: { ...base, scope: "main" as const },
        expected: "agent:a1:main",
        degraded: false,
      },
      {
        desc: "per-peer scope",
        input: { ...base, scope: "per-peer" as const, peerId: "p1" },
        expected: "agent:a1:dm:p1",
        degraded: false,
      },
      {
        desc: "per-channel-peer scope",
        input: { ...base, scope: "per-channel-peer" as const, peerId: "p1" },
        expected: "agent:a1:whatsapp:dm:p1",
        degraded: false,
      },
      {
        desc: "per-account-channel-peer scope",
        input: {
          ...base,
          scope: "per-account-channel-peer" as const,
          peerId: "p1",
          accountId: "acc1",
        },
        expected: "agent:a1:whatsapp:acc1:dm:p1",
        degraded: false,
      },
    ])("$desc → $expected", ({ input, expected, degraded }) => {
      const result = resolveConversationKey(input);
      expect(result.key).toBe(expected);
      expect(result.degraded).toBe(degraded);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("group messages", () => {
    it("ignores DM scope and uses group key", () => {
      const result = resolveConversationKey({
        ...base,
        scope: "per-channel-peer",
        messageType: "group",
        groupId: "grp-42",
      });
      expect(result.key).toBe("agent:a1:whatsapp:group:grp-42");
      expect(result.degraded).toBe(false);
    });

    it("falls back to main when groupId missing", () => {
      const result = resolveConversationKey({
        ...base,
        messageType: "group",
      });
      expect(result.key).toBe("agent:a1:main");
      expect(result.degraded).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("groupId");
    });
  });

  describe("fallback chain", () => {
    it.each([
      {
        desc: "per-peer missing peerId → main",
        input: { ...base, scope: "per-peer" as const },
        expected: "agent:a1:main",
        warningSubstring: "peerId",
      },
      {
        desc: "per-channel-peer missing peerId → main",
        input: { ...base, scope: "per-channel-peer" as const },
        expected: "agent:a1:main",
        warningSubstring: "peerId",
      },
      {
        desc: "per-account-channel-peer missing peerId → main",
        input: { ...base, scope: "per-account-channel-peer" as const, accountId: "acc1" },
        expected: "agent:a1:main",
        warningSubstring: "peerId",
      },
      {
        desc: "per-account-channel-peer missing accountId → per-channel-peer",
        input: { ...base, scope: "per-account-channel-peer" as const, peerId: "p1" },
        expected: "agent:a1:whatsapp:dm:p1",
        warningSubstring: "accountId",
      },
    ])("$desc", ({ input, expected, warningSubstring }) => {
      const result = resolveConversationKey(input);
      expect(result.key).toBe(expected);
      expect(result.degraded).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings[0]).toContain(warningSubstring);
    });
  });

  describe("edge cases", () => {
    it("treats empty string peerId as missing", () => {
      const result = resolveConversationKey({
        ...base,
        scope: "per-peer",
        peerId: "",
      });
      expect(result.key).toBe("agent:a1:main");
      expect(result.degraded).toBe(true);
    });

    it("treats empty string accountId as missing", () => {
      const result = resolveConversationKey({
        ...base,
        scope: "per-account-channel-peer",
        peerId: "p1",
        accountId: "",
      });
      expect(result.key).toBe("agent:a1:whatsapp:dm:p1");
      expect(result.degraded).toBe(true);
    });

    it("handles special characters in peerId (phone numbers)", () => {
      const result = resolveConversationKey({
        ...base,
        scope: "per-peer",
        peerId: "+15551234567",
      });
      expect(result.key).toBe("agent:a1:dm:+15551234567");
      expect(result.degraded).toBe(false);
    });

    it("rejects colon in agentId", () => {
      expect(() => resolveConversationKey({ ...base, agentId: "a:b" })).toThrow(
        "agentId must not contain ':'",
      );
    });

    it("rejects colon in peerId", () => {
      expect(() => resolveConversationKey({ ...base, scope: "per-peer", peerId: "p:1" })).toThrow(
        "peerId must not contain ':'",
      );
    });

    it("rejects colon in channelId", () => {
      expect(() => resolveConversationKey({ ...base, channelId: "ch:1" })).toThrow(
        "channelId must not contain ':'",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// parseConversationKey
// ---------------------------------------------------------------------------

describe("parseConversationKey()", () => {
  it.each([
    {
      desc: "main",
      key: "agent:a1:main",
      expected: { scope: "main", agentId: "a1", channelId: "" },
    },
    {
      desc: "per-peer",
      key: "agent:a1:dm:p1",
      expected: { scope: "per-peer", agentId: "a1", channelId: "", peerId: "p1" },
    },
    {
      desc: "per-channel-peer",
      key: "agent:a1:whatsapp:dm:p1",
      expected: { scope: "per-channel-peer", agentId: "a1", channelId: "whatsapp", peerId: "p1" },
    },
    {
      desc: "per-account-channel-peer",
      key: "agent:a1:telegram:acc1:dm:p1",
      expected: {
        scope: "per-account-channel-peer",
        agentId: "a1",
        channelId: "telegram",
        accountId: "acc1",
        peerId: "p1",
      },
    },
    {
      desc: "group",
      key: "agent:a1:whatsapp:group:grp-42",
      expected: {
        scope: "main",
        agentId: "a1",
        channelId: "whatsapp",
        groupId: "grp-42",
        messageType: "group",
      },
    },
  ])("parses $desc key", ({ key, expected }) => {
    const result = parseConversationKey(key as ConversationKey);
    expect(result).toEqual(expected);
  });

  it("round-trips resolveConversationKey → parseConversationKey", () => {
    const input: ConversationKeyInput = {
      scope: "per-channel-peer",
      agentId: "bot-1",
      channelId: "slack",
      peerId: "user-42",
    };
    const { key } = resolveConversationKey(input);
    const parsed = parseConversationKey(key);
    expect(parsed).toBeDefined();
    expect(parsed?.agentId).toBe("bot-1");
    expect(parsed?.channelId).toBe("slack");
    expect(parsed?.peerId).toBe("user-42");
    expect(parsed?.scope).toBe("per-channel-peer");
  });

  it("returns undefined for unrecognized format", () => {
    expect(parseConversationKey("garbage" as ConversationKey)).toBeUndefined();
  });

  it("returns undefined for too-short key", () => {
    expect(parseConversationKey("agent:a1" as ConversationKey)).toBeUndefined();
  });
});
