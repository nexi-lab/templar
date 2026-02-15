import { describe, expect, it } from "vitest";
import {
  BindingResolver,
  compileBindings,
  compilePattern,
  matchField,
} from "../binding-resolver.js";
import type { AgentBinding } from "../protocol/bindings.js";
import type { LaneMessage } from "../protocol/lanes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<LaneMessage> = {}): LaneMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    lane: "steer",
    channelId: "default-channel",
    payload: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// compilePattern
// ---------------------------------------------------------------------------

describe("compilePattern", () => {
  it("compiles '*' to any matcher", () => {
    expect(compilePattern("*")).toEqual({ type: "any" });
  });

  it("compiles 'slack-*' to prefix matcher", () => {
    expect(compilePattern("slack-*")).toEqual({ type: "prefix", value: "slack-" });
  });

  it("compiles '*-personal' to suffix matcher", () => {
    expect(compilePattern("*-personal")).toEqual({ type: "suffix", value: "-personal" });
  });

  it("compiles 'slack' to exact matcher", () => {
    expect(compilePattern("slack")).toEqual({ type: "exact", value: "slack" });
  });
});

// ---------------------------------------------------------------------------
// matchField
// ---------------------------------------------------------------------------

describe("matchField", () => {
  it("any matches anything", () => {
    expect(matchField({ type: "any" }, "anything")).toBe(true);
    expect(matchField({ type: "any" }, "")).toBe(true);
  });

  it("exact matches only exact value", () => {
    expect(matchField({ type: "exact", value: "slack" }, "slack")).toBe(true);
    expect(matchField({ type: "exact", value: "slack" }, "slack-work")).toBe(false);
    expect(matchField({ type: "exact", value: "slack" }, "discord")).toBe(false);
  });

  it("prefix matches strings starting with value", () => {
    expect(matchField({ type: "prefix", value: "slack-" }, "slack-workspace1")).toBe(true);
    expect(matchField({ type: "prefix", value: "slack-" }, "slack-")).toBe(true);
    expect(matchField({ type: "prefix", value: "slack-" }, "discord-x")).toBe(false);
  });

  it("suffix matches strings ending with value", () => {
    expect(matchField({ type: "suffix", value: "-personal" }, "whatsapp-personal")).toBe(true);
    expect(matchField({ type: "suffix", value: "-personal" }, "-personal")).toBe(true);
    expect(matchField({ type: "suffix", value: "-personal" }, "whatsapp-work")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compileBindings
// ---------------------------------------------------------------------------

describe("compileBindings", () => {
  it("compiles an array of bindings", () => {
    const bindings: AgentBinding[] = [
      { agentId: "work", match: { channel: "slack-*", accountId: "acct-1" } },
      { agentId: "personal", match: { peerId: "*-personal" } },
    ];
    const compiled = compileBindings(bindings);
    expect(compiled).toHaveLength(2);
    expect(compiled[0]?.agentId).toBe("work");
    expect(compiled[0]?.matchers.channel).toEqual({ type: "prefix", value: "slack-" });
    expect(compiled[0]?.matchers.accountId).toEqual({ type: "exact", value: "acct-1" });
    expect(compiled[0]?.matchers.peerId).toBeUndefined();

    expect(compiled[1]?.agentId).toBe("personal");
    expect(compiled[1]?.matchers.peerId).toEqual({ type: "suffix", value: "-personal" });
  });

  it("compiles empty match as catch-all (no matchers)", () => {
    const compiled = compileBindings([{ agentId: "default", match: {} }]);
    expect(compiled).toHaveLength(1);
    expect(compiled[0]?.matchers.channel).toBeUndefined();
    expect(compiled[0]?.matchers.accountId).toBeUndefined();
    expect(compiled[0]?.matchers.peerId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BindingResolver
// ---------------------------------------------------------------------------

describe("BindingResolver", () => {
  // -----------------------------------------------------------------------
  // Exact matching
  // -----------------------------------------------------------------------

  describe("exact matching", () => {
    it("matches on channel only", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("work");
      expect(resolver.resolve(makeMessage({ channelId: "discord" }))).toBeUndefined();
    });

    it("matches on accountId only", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { accountId: "acct-1" } }]);

      expect(resolver.resolve(makeMessage({ routingContext: { accountId: "acct-1" } }))).toBe(
        "work",
      );
      expect(
        resolver.resolve(makeMessage({ routingContext: { accountId: "acct-2" } })),
      ).toBeUndefined();
    });

    it("matches on peerId only", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { peerId: "user-42" } }]);

      expect(resolver.resolve(makeMessage({ routingContext: { peerId: "user-42" } }))).toBe("work");
      expect(
        resolver.resolve(makeMessage({ routingContext: { peerId: "user-99" } })),
      ).toBeUndefined();
    });

    it("matches on channel + accountId", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([
        { agentId: "work", match: { channel: "slack", accountId: "acct-1" } },
      ]);

      expect(
        resolver.resolve(
          makeMessage({ channelId: "slack", routingContext: { accountId: "acct-1" } }),
        ),
      ).toBe("work");
      // Channel matches but accountId doesn't
      expect(
        resolver.resolve(
          makeMessage({ channelId: "slack", routingContext: { accountId: "acct-2" } }),
        ),
      ).toBeUndefined();
      // accountId matches but channel doesn't
      expect(
        resolver.resolve(
          makeMessage({ channelId: "discord", routingContext: { accountId: "acct-1" } }),
        ),
      ).toBeUndefined();
    });

    it("matches on channel + accountId + peerId (all fields)", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([
        {
          agentId: "work",
          match: { channel: "slack", accountId: "acct-1", peerId: "user-42" },
        },
      ]);

      expect(
        resolver.resolve(
          makeMessage({
            channelId: "slack",
            routingContext: { accountId: "acct-1", peerId: "user-42" },
          }),
        ),
      ).toBe("work");
      // Missing peerId
      expect(
        resolver.resolve(
          makeMessage({
            channelId: "slack",
            routingContext: { accountId: "acct-1" },
          }),
        ),
      ).toBeUndefined();
    });

    it("empty match = catch-all", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "default", match: {} }]);

      expect(resolver.resolve(makeMessage({ channelId: "anything" }))).toBe("default");
      expect(
        resolver.resolve(makeMessage({ channelId: "other", routingContext: { peerId: "x" } })),
      ).toBe("default");
    });
  });

  // -----------------------------------------------------------------------
  // Glob matching
  // -----------------------------------------------------------------------

  describe("glob matching", () => {
    it("prefix: 'slack-*' matches 'slack-workspace1'", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack-*" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "slack-workspace1" }))).toBe("work");
    });

    it("prefix: 'slack-*' does NOT match 'discord-x'", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack-*" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "discord-x" }))).toBeUndefined();
    });

    it("suffix: '*-personal' matches 'whatsapp-personal'", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "personal", match: { channel: "*-personal" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "whatsapp-personal" }))).toBe("personal");
    });

    it("full wildcard: '*' matches anything", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "all", match: { channel: "*" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "anything" }))).toBe("all");
    });

    it("glob in accountId field", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { accountId: "org-*" } }]);

      expect(resolver.resolve(makeMessage({ routingContext: { accountId: "org-123" } }))).toBe(
        "work",
      );
      expect(
        resolver.resolve(makeMessage({ routingContext: { accountId: "personal-456" } })),
      ).toBeUndefined();
    });

    it("glob in peerId field", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "vip", match: { peerId: "vip-*" } }]);

      expect(resolver.resolve(makeMessage({ routingContext: { peerId: "vip-user1" } }))).toBe(
        "vip",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Ordering
  // -----------------------------------------------------------------------

  describe("ordering", () => {
    it("first match wins — earlier binding takes precedence", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([
        { agentId: "specific", match: { channel: "slack" } },
        { agentId: "general", match: { channel: "slack" } },
      ]);

      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("specific");
    });

    it("catch-all at end — specific bindings match first", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([
        { agentId: "slack-agent", match: { channel: "slack" } },
        { agentId: "default-agent", match: {} },
      ]);

      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("slack-agent");
      expect(resolver.resolve(makeMessage({ channelId: "discord" }))).toBe("default-agent");
    });

    it("catch-all as only binding", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "catch-all", match: {} }]);

      expect(resolver.resolve(makeMessage({ channelId: "anything" }))).toBe("catch-all");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("empty bindings array returns undefined", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([]);

      expect(resolver.resolve(makeMessage())).toBeUndefined();
    });

    it("no matching binding returns undefined", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { channel: "slack" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "discord" }))).toBeUndefined();
    });

    it("message with missing optional fields (no accountId, no peerId)", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "work", match: { accountId: "acct-1" } }]);

      // No routing context at all — accountId matcher fails
      expect(resolver.resolve(makeMessage())).toBeUndefined();
      // Empty routing context — accountId matcher fails
      expect(resolver.resolve(makeMessage({ routingContext: {} }))).toBeUndefined();
    });

    it("glob pattern with no wildcard treated as exact", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "exact", match: { channel: "slack" } }]);

      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("exact");
      expect(resolver.resolve(makeMessage({ channelId: "slack-work" }))).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Compilation / updateBindings
  // -----------------------------------------------------------------------

  describe("compilation", () => {
    it("updateBindings replaces old matchers", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([{ agentId: "old-agent", match: { channel: "slack" } }]);
      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("old-agent");

      resolver.updateBindings([{ agentId: "new-agent", match: { channel: "slack" } }]);
      expect(resolver.resolve(makeMessage({ channelId: "slack" }))).toBe("new-agent");
    });

    it("getCompiled returns compiled bindings", () => {
      const resolver = new BindingResolver();
      resolver.updateBindings([
        { agentId: "a", match: { channel: "slack-*" } },
        { agentId: "b", match: {} },
      ]);

      const compiled = resolver.getCompiled();
      expect(compiled).toHaveLength(2);
      expect(compiled[0]?.agentId).toBe("a");
      expect(compiled[0]?.matchers.channel?.type).toBe("prefix");
      expect(compiled[1]?.agentId).toBe("b");
    });
  });
});
