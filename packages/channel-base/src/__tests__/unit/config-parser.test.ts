import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseChannelConfig } from "../../config-parser.js";

const TestSchema = z.object({
  token: z.string().min(1, "Token is required"),
  mode: z.enum(["polling", "webhook"]),
  timeout: z.number().int().positive().optional(),
});

type TestConfig = z.infer<typeof TestSchema>;

describe("parseChannelConfig", () => {
  it("returns parsed data for valid input", () => {
    const result = parseChannelConfig<TestConfig>("test", TestSchema, {
      token: "abc-123",
      mode: "polling",
    });

    expect(result).toEqual({
      token: "abc-123",
      mode: "polling",
    });
  });

  it("includes optional fields when provided", () => {
    const result = parseChannelConfig<TestConfig>("test", TestSchema, {
      token: "abc-123",
      mode: "webhook",
      timeout: 5000,
    });

    expect(result).toEqual({
      token: "abc-123",
      mode: "webhook",
      timeout: 5000,
    });
  });

  it("throws ChannelLoadError for invalid input", () => {
    expect(() =>
      parseChannelConfig<TestConfig>("test", TestSchema, {
        mode: "polling",
      }),
    ).toThrow(ChannelLoadError);
  });

  it("includes channel name in error message", () => {
    try {
      parseChannelConfig<TestConfig>("my-channel", TestSchema, {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChannelLoadError);
      expect((error as Error).message).toContain("my-channel");
    }
  });

  it("formats multiple validation issues", () => {
    try {
      parseChannelConfig<TestConfig>("test", TestSchema, {
        timeout: -1,
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChannelLoadError);
      const msg = (error as Error).message;
      // Should contain "Invalid config:" prefix
      expect(msg).toContain("Invalid config:");
    }
  });

  it("includes field paths in error message", () => {
    try {
      parseChannelConfig<TestConfig>("test", TestSchema, {
        token: "",
        mode: "polling",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain("token");
    }
  });
});
