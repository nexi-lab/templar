import { McpConnectionFailedError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { McpServerConfigSchema, parseMcpConfig } from "../../config/config.js";
import {
  MINIMAL_HTTP_CONFIG,
  MINIMAL_STDIO_CONFIG,
  VALID_HTTP_CONFIG,
  VALID_STDIO_CONFIG,
} from "../helpers/fixtures.js";

describe("parseMcpConfig", () => {
  describe("stdio transport", () => {
    it("parses valid stdio config with all fields", () => {
      const result = parseMcpConfig(VALID_STDIO_CONFIG);
      expect(result).toEqual({
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { FOO: "bar" },
        cwd: "/tmp",
      });
    });

    it("parses minimal stdio config (command only)", () => {
      const result = parseMcpConfig(MINIMAL_STDIO_CONFIG);
      expect(result).toEqual({ transport: "stdio", command: "echo" });
    });

    it("rejects stdio config with empty command", () => {
      expect(() => parseMcpConfig({ transport: "stdio", command: "" })).toThrow(
        McpConnectionFailedError,
      );
    });

    it("rejects stdio config missing command", () => {
      expect(() => parseMcpConfig({ transport: "stdio" })).toThrow(McpConnectionFailedError);
    });
  });

  describe("http transport", () => {
    it("parses valid HTTP config with headers", () => {
      const result = parseMcpConfig(VALID_HTTP_CONFIG);
      expect(result).toEqual({
        transport: "http",
        url: "https://mcp.example.com/v1",
        headers: { Authorization: "Bearer token123" },
      });
    });

    it("parses minimal HTTP config (url only)", () => {
      const result = parseMcpConfig(MINIMAL_HTTP_CONFIG);
      expect(result).toEqual({
        transport: "http",
        url: "https://mcp.example.com",
      });
    });

    it("rejects HTTP config with invalid URL", () => {
      expect(() => parseMcpConfig({ transport: "http", url: "not-a-url" })).toThrow(
        McpConnectionFailedError,
      );
    });

    it("rejects HTTP config missing url", () => {
      expect(() => parseMcpConfig({ transport: "http" })).toThrow(McpConnectionFailedError);
    });
  });

  describe("validation", () => {
    it("rejects unknown transport type", () => {
      expect(() => parseMcpConfig({ transport: "websocket", url: "ws://localhost" })).toThrow(
        McpConnectionFailedError,
      );
    });

    it("rejects empty object", () => {
      expect(() => parseMcpConfig({})).toThrow(McpConnectionFailedError);
    });

    it("strips extra fields from stdio config", () => {
      const result = parseMcpConfig({
        transport: "stdio",
        command: "node",
        extraField: "should-be-stripped",
      });
      expect(result).toEqual({ transport: "stdio", command: "node" });
      expect("extraField" in result).toBe(false);
    });

    it("strips extra fields from HTTP config", () => {
      const result = parseMcpConfig({
        transport: "http",
        url: "https://example.com",
        extraField: "should-be-stripped",
      });
      expect(result).toEqual({
        transport: "http",
        url: "https://example.com",
      });
      expect("extraField" in result).toBe(false);
    });
  });
});

describe("McpServerConfigSchema", () => {
  it("is a Zod discriminated union", () => {
    expect(McpServerConfigSchema.parse).toBeDefined();
  });
});
