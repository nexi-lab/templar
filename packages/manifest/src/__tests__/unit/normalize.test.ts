import { describe, expect, it } from "vitest";
import { normalizeManifest } from "../../normalize.js";

const minimal = {
  name: "test-agent",
  version: "1.0.0",
  description: "A test agent",
};

describe("normalizeManifest", () => {
  describe("model normalization", () => {
    it("splits slash format into provider and name", () => {
      const raw = { ...minimal, model: "anthropic/claude-sonnet-4-5" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "anthropic", name: "claude-sonnet-4-5" });
    });

    it("infers anthropic provider for claude- prefix", () => {
      const raw = { ...minimal, model: "claude-sonnet-4-5" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "anthropic", name: "claude-sonnet-4-5" });
    });

    it("infers openai provider for gpt- prefix", () => {
      const raw = { ...minimal, model: "gpt-4o" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "openai", name: "gpt-4o" });
    });

    it("infers openai provider for o1- prefix", () => {
      const raw = { ...minimal, model: "o1-mini" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "openai", name: "o1-mini" });
    });

    it("infers openai provider for o3- prefix", () => {
      const raw = { ...minimal, model: "o3-mini" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "openai", name: "o3-mini" });
    });

    it("infers google provider for gemini- prefix", () => {
      const raw = { ...minimal, model: "gemini-pro" };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "google", name: "gemini-pro" });
    });

    it("passes through object model unchanged", () => {
      const model = { provider: "anthropic", name: "claude-3" };
      const raw = { ...minimal, model };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual(model);
    });

    it("leaves model undefined when not present", () => {
      const result = normalizeManifest({ ...minimal });
      expect(result.model).toBeUndefined();
    });

    it("throws for unknown model prefix without slash", () => {
      const raw = { ...minimal, model: "unknown-xyz" };
      expect(() => normalizeManifest(raw)).toThrow("Cannot infer provider");
    });
  });

  describe("channels normalization", () => {
    it("converts string array to ChannelConfig array", () => {
      const raw = { ...minimal, channels: ["slack", "telegram"] };
      const result = normalizeManifest(raw);
      expect(result.channels).toEqual([
        { type: "slack", config: {} },
        { type: "telegram", config: {} },
      ]);
    });

    it("passes through object channels unchanged", () => {
      const channels = [{ type: "slack", config: { token: "x" } }];
      const raw = { ...minimal, channels };
      const result = normalizeManifest(raw);
      expect(result.channels).toEqual(channels);
    });

    it("leaves channels undefined when not present", () => {
      const result = normalizeManifest({ ...minimal });
      expect(result.channels).toBeUndefined();
    });
  });

  describe("prompt normalization", () => {
    it("maps prompt to identity.default.systemPromptPrefix", () => {
      const raw = { ...minimal, prompt: "You are helpful" };
      const result = normalizeManifest(raw);
      expect(result.identity).toEqual({
        default: { systemPromptPrefix: "You are helpful" },
      });
      expect(result.prompt).toBeUndefined();
    });

    it("merges prompt with existing identity.default fields", () => {
      const raw = {
        ...minimal,
        prompt: "You are helpful",
        identity: { default: { bio: "A bot" } },
      };
      const result = normalizeManifest(raw);
      expect(result.identity).toEqual({
        default: { bio: "A bot", systemPromptPrefix: "You are helpful" },
      });
    });

    it("prompt overwrites existing systemPromptPrefix", () => {
      const raw = {
        ...minimal,
        prompt: "New prompt",
        identity: { default: { systemPromptPrefix: "Old prompt" } },
      };
      const result = normalizeManifest(raw);
      expect(result.identity).toEqual({
        default: { systemPromptPrefix: "New prompt" },
      });
    });

    it("preserves identity.channels when prompt is set", () => {
      const raw = {
        ...minimal,
        prompt: "You are helpful",
        identity: {
          channels: { slack: { name: "Slack Bot" } },
        },
      };
      const result = normalizeManifest(raw);
      expect(result.identity).toEqual({
        default: { systemPromptPrefix: "You are helpful" },
        channels: { slack: { name: "Slack Bot" } },
      });
    });
  });

  describe("pass-through and immutability", () => {
    it("returns a new object for non-sugar manifest", () => {
      const raw = { ...minimal };
      const result = normalizeManifest(raw);
      expect(result).toEqual(raw);
      expect(result).not.toBe(raw);
    });

    it("normalizes all sugar fields together", () => {
      const raw = {
        ...minimal,
        model: "anthropic/claude-sonnet-4-5",
        channels: ["slack", "email"],
        prompt: "You are helpful",
        schedule: "0 9 * * 1-5",
      };
      const result = normalizeManifest(raw);
      expect(result.model).toEqual({ provider: "anthropic", name: "claude-sonnet-4-5" });
      expect(result.channels).toEqual([
        { type: "slack", config: {} },
        { type: "email", config: {} },
      ]);
      expect(result.identity).toEqual({
        default: { systemPromptPrefix: "You are helpful" },
      });
      expect(result.schedule).toBe("0 9 * * 1-5");
      expect(result.prompt).toBeUndefined();
    });

    it("does not mutate the input object", () => {
      const raw = {
        ...minimal,
        model: "gpt-4o",
        identity: { default: { bio: "A bot" } },
      };
      const rawCopy = JSON.parse(JSON.stringify(raw));
      normalizeManifest(raw);
      expect(raw).toEqual(rawCopy);
    });
  });
});
