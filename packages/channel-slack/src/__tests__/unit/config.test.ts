import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { parseSlackConfig } from "../../config.js";

describe("parseSlackConfig", () => {
  it("parses valid socket mode config", () => {
    const config = parseSlackConfig({
      mode: "socket",
      token: "xoxb-test-token",
      appToken: "xapp-test-token",
    });
    expect(config).toEqual({
      mode: "socket",
      token: "xoxb-test-token",
      appToken: "xapp-test-token",
    });
  });

  it("throws ChannelLoadError when token is missing", () => {
    expect(() =>
      parseSlackConfig({
        mode: "socket",
        appToken: "xapp-test-token",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("throws ChannelLoadError when appToken is missing", () => {
    expect(() =>
      parseSlackConfig({
        mode: "socket",
        token: "xoxb-test-token",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("throws ChannelLoadError when token is empty", () => {
    expect(() =>
      parseSlackConfig({
        mode: "socket",
        token: "",
        appToken: "xapp-test-token",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("throws ChannelLoadError when appToken is empty", () => {
    expect(() =>
      parseSlackConfig({
        mode: "socket",
        token: "xoxb-test-token",
        appToken: "",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("throws ChannelLoadError for invalid mode", () => {
    expect(() =>
      parseSlackConfig({
        mode: "invalid",
        token: "xoxb-test-token",
        appToken: "xapp-test-token",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("throws ChannelLoadError when mode is missing", () => {
    expect(() =>
      parseSlackConfig({
        token: "xoxb-test-token",
        appToken: "xapp-test-token",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("strips extra fields", () => {
    const config = parseSlackConfig({
      mode: "socket",
      token: "xoxb-test-token",
      appToken: "xapp-test-token",
      extraField: "should be stripped",
    });
    expect(config).toEqual({
      mode: "socket",
      token: "xoxb-test-token",
      appToken: "xapp-test-token",
    });
  });

  it("includes descriptive error message", () => {
    expect(() => parseSlackConfig({ mode: "socket" })).toThrow(/Invalid config/);
  });
});
