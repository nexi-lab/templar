import {
  ERROR_CATALOG,
  McpConnectionFailedError,
  McpInitializationFailedError,
  McpResourceNotFoundError,
  McpResourceReadFailedError,
  McpServerDisconnectedError,
  McpToolCallFailedError,
  McpToolNotFoundError,
  McpTransportError,
  TemplarError,
} from "@templar/errors";
import { describe, expect, it } from "vitest";

describe("MCP error classes", () => {
  const errorCases = [
    {
      ErrorClass: McpConnectionFailedError,
      code: "MCP_CONNECTION_FAILED",
      factory: () => new McpConnectionFailedError("test-server", "refused"),
    },
    {
      ErrorClass: McpInitializationFailedError,
      code: "MCP_INITIALIZATION_FAILED",
      factory: () => new McpInitializationFailedError("test-server", "handshake failed"),
    },
    {
      ErrorClass: McpToolCallFailedError,
      code: "MCP_TOOL_CALL_FAILED",
      factory: () => new McpToolCallFailedError("get_weather", "timeout"),
    },
    {
      ErrorClass: McpToolNotFoundError,
      code: "MCP_TOOL_NOT_FOUND",
      factory: () => new McpToolNotFoundError("missing_tool"),
    },
    {
      ErrorClass: McpResourceNotFoundError,
      code: "MCP_RESOURCE_NOT_FOUND",
      factory: () => new McpResourceNotFoundError("file:///missing"),
    },
    {
      ErrorClass: McpResourceReadFailedError,
      code: "MCP_RESOURCE_READ_FAILED",
      factory: () => new McpResourceReadFailedError("file:///data", "permission denied"),
    },
    {
      ErrorClass: McpTransportError,
      code: "MCP_TRANSPORT_ERROR",
      factory: () => new McpTransportError("pipe broken"),
    },
    {
      ErrorClass: McpServerDisconnectedError,
      code: "MCP_SERVER_DISCONNECTED",
      factory: () => new McpServerDisconnectedError("test-server"),
    },
  ] as const;

  for (const { ErrorClass, code, factory } of errorCases) {
    describe(ErrorClass.name, () => {
      it("extends TemplarError", () => {
        const error = factory();
        expect(error).toBeInstanceOf(TemplarError);
        expect(error).toBeInstanceOf(Error);
      });

      it(`has code ${code}`, () => {
        const error = factory();
        expect(error.code).toBe(code);
      });

      it("has correct domain", () => {
        const error = factory();
        expect(error.domain).toBe("mcp");
      });

      it("has correct httpStatus from catalog", () => {
        const error = factory();
        const entry = ERROR_CATALOG[code as keyof typeof ERROR_CATALOG];
        expect(error.httpStatus).toBe(entry.httpStatus);
      });

      it("has correct grpcCode from catalog", () => {
        const error = factory();
        const entry = ERROR_CATALOG[code as keyof typeof ERROR_CATALOG];
        expect(error.grpcCode).toBe(entry.grpcCode);
      });

      it("has a meaningful message", () => {
        const error = factory();
        expect(error.message.length).toBeGreaterThan(0);
      });
    });
  }

  it("McpConnectionFailedError includes server name in message", () => {
    const error = new McpConnectionFailedError("my-server", "refused");
    expect(error.message).toContain("my-server");
    expect(error.serverName).toBe("my-server");
  });

  it("McpToolCallFailedError includes tool name in message", () => {
    const error = new McpToolCallFailedError("get_weather", "timeout");
    expect(error.message).toContain("get_weather");
    expect(error.toolName).toBe("get_weather");
  });

  it("McpToolNotFoundError includes tool name in message", () => {
    const error = new McpToolNotFoundError("missing_tool");
    expect(error.message).toContain("missing_tool");
    expect(error.toolName).toBe("missing_tool");
  });

  it("McpResourceNotFoundError includes URI in message", () => {
    const error = new McpResourceNotFoundError("file:///missing");
    expect(error.message).toContain("file:///missing");
    expect(error.uri).toBe("file:///missing");
  });

  it("McpTransportError preserves cause", () => {
    const cause = new Error("underlying");
    const error = new McpTransportError("pipe broken", cause);
    expect(error.cause).toBe(cause);
  });

  it("McpServerDisconnectedError includes server name", () => {
    const error = new McpServerDisconnectedError("remote-server");
    expect(error.message).toContain("remote-server");
    expect(error.serverName).toBe("remote-server");
  });
});
