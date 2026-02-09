import { describe, expect, it } from "vitest";
import {
  AgentExecutionError,
  AgentNotFoundError,
  InternalError,
  isError,
  isTemplarError,
  NotFoundError,
  QuotaExceededError,
  TemplarError,
  TokenExpiredError,
  ValidationError,
} from "../../index.js";

describe("TemplarError base class", () => {
  it("should create error with correct properties", () => {
    const error = new InternalError("Test error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TemplarError);
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("InternalError");
    expect(error._tag).toBe("InternalError");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.httpStatus).toBe(500);
    expect(error.grpcCode).toBe("INTERNAL");
    expect(error.domain).toBe("internal");
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it("should preserve stack traces", () => {
    const error = new InternalError("Stack test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("InternalError");
  });

  it("should support metadata", () => {
    const metadata = { userId: "123", action: "test" };
    const error = new InternalError("With metadata", metadata);

    expect(error.metadata).toEqual(metadata);
  });

  it("should support trace ID", () => {
    const traceId = "trace-abc-123";
    const error = new InternalError("With trace", undefined, traceId);

    expect(error.traceId).toBe(traceId);
  });

  it("should serialize to JSON", () => {
    const error = new InternalError("JSON test", { key: "value" }, "trace-123");
    const json = error.toJSON();

    expect(json).toMatchObject({
      _tag: "InternalError",
      name: "InternalError",
      code: "INTERNAL_ERROR",
      message: "JSON test",
      domain: "internal",
      httpStatus: 500,
      grpcCode: "INTERNAL",
      metadata: { key: "value" },
      traceId: "trace-123",
    });
    expect(json.timestamp).toBeDefined();
    expect(json.stack).toBeDefined();
  });

  it("should convert to string with metadata and trace", () => {
    const error = new InternalError("String test", { key: "value" }, "trace-123");
    const str = error.toString();

    expect(str).toContain("[INTERNAL_ERROR]");
    expect(str).toContain("String test");
    expect(str).toContain('{"key":"value"}');
    expect(str).toContain("[trace: trace-123]");
  });
});

describe("NotFoundError", () => {
  it("should construct with resource type and ID", () => {
    const error = new NotFoundError("Agent", "agent-123");

    expect(error._tag).toBe("NotFoundError");
    expect(error.code).toBe("RESOURCE_NOT_FOUND");
    expect(error.resourceType).toBe("Agent");
    expect(error.resourceId).toBe("agent-123");
    expect(error.message).toBe("Agent with ID 'agent-123' not found");
    expect(error.httpStatus).toBe(404);
  });
});

describe("ValidationError", () => {
  it("should construct with validation issues", () => {
    const issues = [
      { field: "email", message: "Invalid email", code: "invalid_format" },
      { field: "age", message: "Must be positive", code: "out_of_range", value: -5 },
    ];

    const error = new ValidationError("Validation failed", issues);

    expect(error._tag).toBe("ValidationError");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.issues).toEqual(issues);
    expect(error.httpStatus).toBe(400);
  });
});

describe("AgentNotFoundError", () => {
  it("should construct with agent ID", () => {
    const error = new AgentNotFoundError("agent-xyz");

    expect(error._tag).toBe("AgentNotFoundError");
    expect(error.code).toBe("AGENT_NOT_FOUND");
    expect(error.agentId).toBe("agent-xyz");
    expect(error.message).toBe("Agent 'agent-xyz' not found");
    expect(error.domain).toBe("agent");
  });
});

describe("AgentExecutionError", () => {
  it("should construct with agent ID and cause", () => {
    const cause = new Error("Underlying error");
    const error = new AgentExecutionError("agent-abc", "Execution failed", cause);

    expect(error._tag).toBe("AgentExecutionError");
    expect(error.code).toBe("AGENT_EXECUTION_FAILED");
    expect(error.agentId).toBe("agent-abc");
    expect(error.cause).toBe(cause);
    expect(error.message).toContain("agent-abc");
    expect(error.message).toContain("Execution failed");
  });
});

describe("TokenExpiredError", () => {
  it("should have correct auth domain and properties", () => {
    const error = new TokenExpiredError("Token expired");

    expect(error._tag).toBe("TokenExpiredError");
    expect(error.code).toBe("AUTH_TOKEN_EXPIRED");
    expect(error.domain).toBe("auth");
    expect(error.httpStatus).toBe(401);
    expect(error.grpcCode).toBe("UNAUTHENTICATED");
  });
});

describe("QuotaExceededError", () => {
  it("should construct with quota details", () => {
    const error = new QuotaExceededError("API calls", 1000, 1050);

    expect(error._tag).toBe("QuotaExceededError");
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.quotaType).toBe("API calls");
    expect(error.limit).toBe(1000);
    expect(error.current).toBe(1050);
    expect(error.message).toContain("1050/1000");
    expect(error.httpStatus).toBe(429);
  });
});

describe("Type guards", () => {
  it("should identify TemplarError instances", () => {
    const templarError = new InternalError("Test");
    const regularError = new Error("Regular");
    const notError = { message: "Not an error" };

    expect(isTemplarError(templarError)).toBe(true);
    expect(isTemplarError(regularError)).toBe(false);
    expect(isTemplarError(notError)).toBe(false);
  });

  it("should identify Error instances", () => {
    const templarError = new InternalError("Test");
    const regularError = new Error("Regular");
    const notError = { message: "Not an error" };

    expect(isError(templarError)).toBe(true);
    expect(isError(regularError)).toBe(true);
    expect(isError(notError)).toBe(false);
  });
});

describe("instanceof checks", () => {
  it("should work with instanceof operator", () => {
    const error = new AgentNotFoundError("test");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof TemplarError).toBe(true);
    expect(error instanceof AgentNotFoundError).toBe(true);
    expect(error instanceof InternalError).toBe(false);
  });
});
