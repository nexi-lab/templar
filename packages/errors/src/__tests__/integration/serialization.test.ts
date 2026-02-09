import { describe, expect, it } from "vitest";
import {
  AgentExecutionError,
  AgentNotFoundError,
  deserializeFromGrpc,
  deserializeFromRFC9457,
  deserializeFromWebSocket,
  InternalError,
  NotFoundError,
  QuotaExceededError,
  safeDeserialize,
  serializeError,
  serializeToGrpc,
  serializeToRFC9457,
  serializeToWebSocket,
  TokenExpiredError,
  ValidationError,
} from "../../index.js";

describe("RFC 9457 serialization round-trips", () => {
  it("should round-trip InternalError", () => {
    const original = new InternalError("Test error", { key: "value" }, "trace-123");
    const serialized = serializeToRFC9457(original);
    const deserialized = deserializeFromRFC9457(serialized);

    expect(deserialized.code).toBe(original.code);
    expect(deserialized.message).toBe(original.message);
    expect(deserialized.httpStatus).toBe(original.httpStatus);
    expect(deserialized.domain).toBe(original.domain);
  });

  it("should round-trip NotFoundError with metadata", () => {
    const original = new NotFoundError("Agent", "agent-123", { userId: "user-1" }, "trace-abc");
    const serialized = serializeToRFC9457(original);

    expect(serialized.type).toBe("/errors/NotFoundError");
    expect(serialized.status).toBe(404);
    expect(serialized.code).toBe("RESOURCE_NOT_FOUND");
    expect(serialized.traceId).toBe("trace-abc");
    expect(serialized.metadata).toEqual({ userId: "user-1" });

    const deserialized = deserializeFromRFC9457(serialized);
    expect(deserialized.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("should round-trip ValidationError with issues", () => {
    const issues = [
      { field: "email", message: "Invalid email", code: "invalid_format" },
      { field: "age", message: "Too young", code: "out_of_range", value: 15 },
    ];
    const original = new ValidationError("Validation failed", issues);
    const serialized = serializeToRFC9457(original);

    expect(serialized.errors).toHaveLength(2);
    expect(serialized.errors?.[0]).toMatchObject({
      field: "email",
      message: "Invalid email",
      code: "invalid_format",
    });

    const deserialized = deserializeFromRFC9457(serialized) as ValidationError;
    expect(deserialized.code).toBe("VALIDATION_FAILED");
    expect(deserialized.issues).toHaveLength(2);
  });

  it("should round-trip AgentNotFoundError", () => {
    const original = new AgentNotFoundError("agent-xyz", { env: "prod" });
    const serialized = serializeToRFC9457(original);

    expect(serialized.code).toBe("AGENT_NOT_FOUND");
    expect(serialized.domain).toBe("agent");

    const deserialized = deserializeFromRFC9457(serialized);
    expect(deserialized.code).toBe("AGENT_NOT_FOUND");
  });

  it("should handle missing code gracefully", () => {
    const malformed = {
      type: "/errors/Unknown",
      title: "Unknown Error",
      status: 500,
      detail: "Something went wrong",
    };

    const deserialized = deserializeFromRFC9457(malformed);
    expect(deserialized.code).toBe("INTERNAL_ERROR");
    expect(deserialized.message).toBe("Something went wrong");
  });

  it("should handle invalid code gracefully", () => {
    const malformed = {
      type: "/errors/InvalidCode",
      title: "Invalid",
      status: 500,
      code: "NOT_A_REAL_CODE",
    };

    const deserialized = deserializeFromRFC9457(malformed);
    expect(deserialized.code).toBe("INTERNAL_ERROR");
  });
});

describe("gRPC serialization round-trips", () => {
  it("should serialize to gRPC status format", () => {
    const error = new AgentNotFoundError("agent-123", { userId: "user-1" }, "trace-xyz");
    const grpcStatus = serializeToGrpc(error);

    expect(grpcStatus.code).toBe(5); // NOT_FOUND
    expect(grpcStatus.message).toBe("Agent 'agent-123' not found");
    expect(grpcStatus.details).toHaveLength(1);
    expect(grpcStatus.details[0]["@type"]).toBe("type.googleapis.com/google.rpc.ErrorInfo");
    expect(grpcStatus.details[0].reason).toBe("AGENT_NOT_FOUND");
    expect(grpcStatus.details[0].domain).toBe("agent.templar.com");
    expect(grpcStatus.details[0].metadata.traceId).toBe("trace-xyz");
    expect(grpcStatus.details[0].metadata.userId).toBe("user-1");
  });

  it("should round-trip through gRPC format", () => {
    const original = new TokenExpiredError("Token expired", { userId: "123" });
    const serialized = serializeToGrpc(original);
    const deserialized = deserializeFromGrpc(serialized);

    expect(deserialized.code).toBe("AUTH_TOKEN_EXPIRED");
    expect(deserialized.domain).toBe("auth");
  });

  it("should handle invalid gRPC status gracefully", () => {
    const malformed = {
      code: 13, // INTERNAL
      message: "Internal error",
      details: [],
    };

    const deserialized = deserializeFromGrpc(malformed);
    expect(deserialized.code).toBe("INTERNAL_ERROR");
  });
});

describe("WebSocket serialization round-trips", () => {
  it("should serialize to WebSocket error format", () => {
    const error = new QuotaExceededError("API calls", 1000, 1050);
    const wsMessage = serializeToWebSocket(error, "req-123");

    expect(wsMessage.type).toBe("error");
    expect(wsMessage.requestId).toBe("req-123");
    expect(wsMessage.error.code).toBe("QUOTA_EXCEEDED");
    expect(wsMessage.timestamp).toBeDefined();
  });

  it("should round-trip through WebSocket format", () => {
    const original = new AgentExecutionError("agent-abc", "Execution failed");
    const serialized = serializeToWebSocket(original, "req-456");
    const deserialized = deserializeFromWebSocket(serialized);

    expect(deserialized.code).toBe("AGENT_EXECUTION_FAILED");
    expect(deserialized.domain).toBe("agent");
  });
});

describe("Generic serialization", () => {
  it("should serialize TemplarError", () => {
    const error = new InternalError("Test");
    const serialized = serializeError(error);

    expect(serialized.code).toBe("INTERNAL_ERROR");
    expect(serialized.status).toBe(500);
  });

  it("should serialize regular Error as InternalError", () => {
    const error = new Error("Regular error");
    const serialized = serializeError(error, "trace-999");

    expect(serialized.code).toBe("INTERNAL_ERROR");
    expect(serialized.traceId).toBe("trace-999");
    expect(serialized.detail).toBe("Regular error");
  });

  it("should serialize unknown values as InternalError", () => {
    const serialized = serializeError("String error");

    expect(serialized.code).toBe("INTERNAL_ERROR");
    expect(serialized.detail).toBe("String error");
  });
});

describe("Safe deserialization", () => {
  it("should safely deserialize valid RFC 9457", () => {
    const valid = {
      type: "/errors/AgentNotFoundError",
      title: "Agent not found",
      status: 404,
      code: "AGENT_NOT_FOUND",
    };

    const error = safeDeserialize(valid, "rfc9457");
    expect(error.code).toBe("AGENT_NOT_FOUND");
  });

  it("should return InternalError for malformed RFC 9457", () => {
    const malformed = {
      // Missing required fields
      type: "/errors/Test",
    };

    const error = safeDeserialize(malformed, "rfc9457");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toContain("Failed to deserialize");
  });

  it("should return InternalError for invalid JSON", () => {
    const error = safeDeserialize("not an object", "rfc9457");
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("should handle all wire formats", () => {
    const validRfc = {
      type: "/errors/Test",
      title: "Test",
      status: 500,
      code: "INTERNAL_ERROR",
    };

    const validGrpc = {
      code: 13,
      message: "Internal",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "INTERNAL_ERROR",
          domain: "internal.templar.com",
          metadata: {},
        },
      ],
    };

    const validWs = {
      type: "error",
      error: validRfc,
      timestamp: new Date().toISOString(),
    };

    expect(safeDeserialize(validRfc, "rfc9457").code).toBe("INTERNAL_ERROR");
    expect(safeDeserialize(validGrpc, "grpc").code).toBe("INTERNAL_ERROR");
    expect(safeDeserialize(validWs, "websocket").code).toBe("INTERNAL_ERROR");
  });
});

describe("Edge cases", () => {
  it("should preserve stack traces through serialization", () => {
    const original = new InternalError("Test");
    expect(original.stack).toBeDefined();

    const json = original.toJSON();
    expect(json.stack).toBeDefined();
  });

  it("should handle very long error messages", () => {
    const longMessage = "x".repeat(10000);
    const error = new InternalError(longMessage);
    const serialized = serializeToRFC9457(error);

    expect(serialized.detail).toBe(longMessage);
  });

  it("should handle metadata with special characters", () => {
    const metadata = {
      key: 'value with "quotes" and \\backslashes\\',
      emoji: "🚀💥",
      unicode: "日本語",
    };

    const error = new InternalError("Test", metadata);
    const serialized = serializeToRFC9457(error);

    expect(serialized.metadata).toEqual(metadata);
  });

  it("should handle empty metadata", () => {
    const error = new InternalError("Test", {});
    const serialized = serializeToRFC9457(error);

    expect(serialized.metadata).toEqual({});
  });

  it("should handle undefined metadata", () => {
    const error = new InternalError("Test", undefined);
    const serialized = serializeToRFC9457(error);

    expect(serialized.metadata).toBeUndefined();
  });

  it("should handle malformed wire format with wrong types", () => {
    const malformed = {
      type: "/errors/Test",
      title: "Test",
      status: "404", // string instead of number
      code: "RESOURCE_NOT_FOUND",
    };

    expect(() => deserializeFromRFC9457(malformed)).toThrow();
  });
});
