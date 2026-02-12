import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { DEFAULT_INTENTS, DEFAULT_SWEEPERS, parseDiscordConfig } from "../../config.js";

describe("parseDiscordConfig", () => {
  // -----------------------------------------------------------------------
  // Valid configurations
  // -----------------------------------------------------------------------

  describe("valid configs", () => {
    it("accepts token-only config and applies defaults", () => {
      const config = parseDiscordConfig({ token: "Bot abc123" });

      expect(config.token).toBe("Bot abc123");
      expect(config.intents).toEqual(DEFAULT_INTENTS);
      expect(config.sweepers).toEqual(DEFAULT_SWEEPERS);
      expect(config.presence).toBeUndefined();
    });

    it("accepts config with custom intents", () => {
      const config = parseDiscordConfig({
        token: "Bot abc123",
        intents: ["Guilds", "GuildMessages"],
      });

      expect(config.intents).toEqual(["Guilds", "GuildMessages"]);
    });

    it("accepts config with custom sweepers", () => {
      const sweepers = {
        messages: { interval: 1800, lifetime: 900 },
      };
      const config = parseDiscordConfig({
        token: "Bot abc123",
        sweepers,
      });

      expect(config.sweepers).toEqual(sweepers);
    });

    it("accepts config with presence", () => {
      const config = parseDiscordConfig({
        token: "Bot abc123",
        presence: {
          status: "online",
          activities: [{ name: "Helping users", type: 0 }],
        },
      });

      expect(config.presence).toEqual({
        status: "online",
        activities: [{ name: "Helping users", type: 0 }],
      });
    });

    it("accepts full config with all fields", () => {
      const config = parseDiscordConfig({
        token: "Bot abc123",
        intents: ["Guilds"],
        sweepers: { messages: { interval: 600, lifetime: 300 } },
        presence: { status: "dnd" },
      });

      expect(config.token).toBe("Bot abc123");
      expect(config.intents).toEqual(["Guilds"]);
      expect(config.sweepers).toEqual({ messages: { interval: 600, lifetime: 300 } });
      expect(config.presence).toEqual({ status: "dnd" });
    });
  });

  // -----------------------------------------------------------------------
  // Invalid configurations
  // -----------------------------------------------------------------------

  describe("invalid configs", () => {
    it("throws ChannelLoadError for missing token", () => {
      expect(() => parseDiscordConfig({})).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for empty token", () => {
      expect(() => parseDiscordConfig({ token: "" })).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for non-string token", () => {
      expect(() => parseDiscordConfig({ token: 12345 })).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for invalid intents type", () => {
      expect(() => parseDiscordConfig({ token: "Bot abc", intents: "Guilds" })).toThrow(
        ChannelLoadError,
      );
    });

    it("throws ChannelLoadError for invalid intent name", () => {
      expect(() => parseDiscordConfig({ token: "Bot abc", intents: ["InvalidIntent"] })).toThrow(
        ChannelLoadError,
      );
    });

    it("throws ChannelLoadError for invalid presence status", () => {
      expect(() =>
        parseDiscordConfig({ token: "Bot abc", presence: { status: "sleeping" } }),
      ).toThrow(ChannelLoadError);
    });

    it("includes descriptive message in error", () => {
      expect(() => parseDiscordConfig({})).toThrow(/token/i);
    });
  });

  // -----------------------------------------------------------------------
  // Defaults
  // -----------------------------------------------------------------------

  describe("defaults", () => {
    it("DEFAULT_INTENTS includes Guilds, GuildMessages, MessageContent", () => {
      expect(DEFAULT_INTENTS).toContain("Guilds");
      expect(DEFAULT_INTENTS).toContain("GuildMessages");
      expect(DEFAULT_INTENTS).toContain("MessageContent");
    });

    it("DEFAULT_SWEEPERS includes message sweeping config", () => {
      expect(DEFAULT_SWEEPERS.messages).toBeDefined();
      expect(DEFAULT_SWEEPERS.messages?.interval).toBeGreaterThan(0);
      expect(DEFAULT_SWEEPERS.messages?.lifetime).toBeGreaterThan(0);
    });

    it("DEFAULT_SWEEPERS includes thread sweeping config", () => {
      expect(DEFAULT_SWEEPERS.threads).toBeDefined();
      expect(DEFAULT_SWEEPERS.threads?.interval).toBeGreaterThan(0);
      expect(DEFAULT_SWEEPERS.threads?.lifetime).toBeGreaterThan(0);
    });
  });
});
