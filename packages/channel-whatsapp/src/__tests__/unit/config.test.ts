import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { parseWhatsAppConfig } from "../../config.js";

describe("parseWhatsAppConfig", () => {
  it("should parse empty config with all defaults", () => {
    const config = parseWhatsAppConfig({});

    expect(config.authStatePath).toBe(".whatsapp-auth");
    expect(config.authStateProvider).toBeUndefined();
    expect(config.printQRInTerminal).toBe(true);
    expect(config.browser).toEqual(["Templar", "Chrome", "22.0"]);
    expect(config.connectTimeoutMs).toBe(20_000);
    expect(config.maxReconnectAttempts).toBe(10);
    expect(config.reconnectBaseDelay).toBe(2_000);
    expect(config.reconnectMaxDelay).toBe(60_000);
    expect(config.messageDelay).toBe(3_000);
    expect(config.burstLimit).toBe(5);
    expect(config.jitter).toBe(0.2);
    expect(config.syncHistory).toBe(false);
    expect(config.onQR).toBeUndefined();
    expect(config.onConnectionUpdate).toBeUndefined();
  });

  it("should accept custom auth state path", () => {
    const config = parseWhatsAppConfig({ authStatePath: "/tmp/wa-auth" });
    expect(config.authStatePath).toBe("/tmp/wa-auth");
  });

  it("should accept custom browser tuple", () => {
    const config = parseWhatsAppConfig({
      browser: ["MyApp", "Firefox", "1.0"],
    });
    expect(config.browser).toEqual(["MyApp", "Firefox", "1.0"]);
  });

  it("should accept custom rate limiting config", () => {
    const config = parseWhatsAppConfig({
      messageDelay: 5000,
      burstLimit: 3,
      jitter: 0.5,
    });
    expect(config.messageDelay).toBe(5000);
    expect(config.burstLimit).toBe(3);
    expect(config.jitter).toBe(0.5);
  });

  it("should accept custom reconnection config", () => {
    const config = parseWhatsAppConfig({
      maxReconnectAttempts: 5,
      reconnectBaseDelay: 1000,
      reconnectMaxDelay: 30_000,
    });
    expect(config.maxReconnectAttempts).toBe(5);
    expect(config.reconnectBaseDelay).toBe(1000);
    expect(config.reconnectMaxDelay).toBe(30_000);
  });

  it("should extract onQR callback", () => {
    const onQR = vi.fn();
    const config = parseWhatsAppConfig({ onQR });
    expect(config.onQR).toBe(onQR);
  });

  it("should extract onConnectionUpdate callback", () => {
    const onConnectionUpdate = vi.fn();
    const config = parseWhatsAppConfig({ onConnectionUpdate });
    expect(config.onConnectionUpdate).toBe(onConnectionUpdate);
  });

  it("should extract authStateProvider", () => {
    const provider = {
      getState: vi.fn(),
      saveCreds: vi.fn(),
      clear: vi.fn(),
    };
    const config = parseWhatsAppConfig({ authStateProvider: provider });
    expect(config.authStateProvider).toBe(provider);
  });

  it("should ignore non-function onQR", () => {
    const config = parseWhatsAppConfig({ onQR: "not-a-function" });
    expect(config.onQR).toBeUndefined();
  });

  it("should enable syncHistory when true", () => {
    const config = parseWhatsAppConfig({ syncHistory: true });
    expect(config.syncHistory).toBe(true);
  });

  it("should throw ChannelLoadError on invalid connectTimeoutMs", () => {
    expect(() => parseWhatsAppConfig({ connectTimeoutMs: -1 })).toThrow(ChannelLoadError);
  });

  it("should throw ChannelLoadError on invalid jitter (> 1)", () => {
    expect(() => parseWhatsAppConfig({ jitter: 1.5 })).toThrow(ChannelLoadError);
  });

  it("should throw ChannelLoadError on empty authStatePath", () => {
    expect(() => parseWhatsAppConfig({ authStatePath: "" })).toThrow(ChannelLoadError);
  });

  it("should include field path in error message", () => {
    try {
      parseWhatsAppConfig({ connectTimeoutMs: "not-a-number" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChannelLoadError);
      expect((error as Error).message).toContain("connectTimeoutMs");
    }
  });

  it("should allow maxReconnectAttempts of 0 (disable reconnection)", () => {
    const config = parseWhatsAppConfig({ maxReconnectAttempts: 0 });
    expect(config.maxReconnectAttempts).toBe(0);
  });

  it("should allow messageDelay of 0 (no rate limiting)", () => {
    const config = parseWhatsAppConfig({ messageDelay: 0 });
    expect(config.messageDelay).toBe(0);
  });
});
