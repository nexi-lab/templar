import { describe, expect, it } from "vitest";
import { MockChannelAdapter } from "../helpers/mock-channel.js";
import { isChannelAdapter } from "../../type-guards.js";

describe("isChannelAdapter", () => {
  it("should return true for valid MockChannelAdapter", () => {
    const adapter = new MockChannelAdapter();
    expect(isChannelAdapter(adapter)).toBe(true);
  });

  it("should return true for object with all required properties and methods", () => {
    const adapter = {
      name: "test-adapter",
      capabilities: {
        text: true,
        richText: false,
        images: false,
        files: false,
        buttons: false,
        threads: false,
        reactions: false,
        typingIndicator: false,
        readReceipts: false,
        voiceMessages: false,
        groups: false,
        maxMessageLength: 1000,
      },
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(adapter)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isChannelAdapter(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isChannelAdapter(undefined)).toBe(false);
  });

  it("should return false for primitive values", () => {
    expect(isChannelAdapter("string")).toBe(false);
    expect(isChannelAdapter(123)).toBe(false);
    expect(isChannelAdapter(true)).toBe(false);
  });

  it("should return false for object missing name property", () => {
    const invalid = {
      capabilities: {},
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object with non-string name", () => {
    const invalid = {
      name: 123,
      capabilities: {},
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object missing connect method", () => {
    const invalid = {
      name: "test",
      capabilities: {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object missing disconnect method", () => {
    const invalid = {
      name: "test",
      capabilities: {},
      connect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object missing send method", () => {
    const invalid = {
      name: "test",
      capabilities: {},
      connect: async () => {},
      disconnect: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object missing onMessage method", () => {
    const invalid = {
      name: "test",
      capabilities: {},
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object missing capabilities property", () => {
    const invalid = {
      name: "test",
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for object with null capabilities", () => {
    const invalid = {
      name: "test",
      capabilities: null,
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
    };
    expect(isChannelAdapter(invalid)).toBe(false);
  });

  it("should return false for empty object", () => {
    expect(isChannelAdapter({})).toBe(false);
  });
});
