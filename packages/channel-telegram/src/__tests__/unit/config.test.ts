import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { parseTelegramConfig } from "../../config.js";

describe("parseTelegramConfig", () => {
  describe("polling mode", () => {
    it("accepts valid polling config", () => {
      const config = parseTelegramConfig({
        mode: "polling",
        token: "123:ABC",
      });
      expect(config).toEqual({ mode: "polling", token: "123:ABC" });
    });

    it("strips extra fields", () => {
      const config = parseTelegramConfig({
        mode: "polling",
        token: "123:ABC",
        extraField: "should be ignored",
      });
      expect(config).toEqual({ mode: "polling", token: "123:ABC" });
    });
  });

  describe("webhook mode", () => {
    it("accepts valid webhook config", () => {
      const config = parseTelegramConfig({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
      });
      expect(config).toEqual({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
      });
    });

    it("accepts webhook config with secretToken", () => {
      const config = parseTelegramConfig({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
        secretToken: "my-secret",
      });
      expect(config).toEqual({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
        secretToken: "my-secret",
      });
    });

    it("rejects webhook config without webhookUrl", () => {
      expect(() => parseTelegramConfig({ mode: "webhook", token: "123:ABC" })).toThrow(
        ChannelLoadError,
      );
    });

    it("rejects webhook config with invalid URL", () => {
      expect(() =>
        parseTelegramConfig({
          mode: "webhook",
          token: "123:ABC",
          webhookUrl: "not-a-url",
        }),
      ).toThrow(ChannelLoadError);
    });
  });

  describe("validation errors", () => {
    it("rejects missing token", () => {
      expect(() => parseTelegramConfig({ mode: "polling" })).toThrow(ChannelLoadError);
    });

    it("rejects empty token", () => {
      expect(() => parseTelegramConfig({ mode: "polling", token: "" })).toThrow(ChannelLoadError);
    });

    it("rejects invalid mode", () => {
      expect(() => parseTelegramConfig({ mode: "invalid", token: "123:ABC" })).toThrow(
        ChannelLoadError,
      );
    });

    it("rejects empty config", () => {
      expect(() => parseTelegramConfig({})).toThrow(ChannelLoadError);
    });

    it("includes field path in error message", () => {
      try {
        parseTelegramConfig({ mode: "polling", token: "" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelLoadError);
        expect((error as ChannelLoadError).message).toContain("token");
      }
    });
  });
});
