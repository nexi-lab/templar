import { describe, expect, it } from "vitest";
import {
  AgentNotFoundError,
  ConflictError,
  ExternalError,
  InternalError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  type TemplarError,
  TimeoutError,
  TokenExpiredError,
  ValidationError,
} from "../../index.js";

describe("Exhaustive type checking with _tag discriminant (8 base types)", () => {
  it("should enable exhaustive switch on the 8 base _tag values", () => {
    function handleError(error: TemplarError): string {
      switch (error._tag) {
        case "ValidationError":
          return "validation";
        case "NotFoundError":
          return "not_found";
        case "PermissionError":
          return "permission";
        case "ConflictError":
          return "conflict";
        case "RateLimitError":
          return "rate_limit";
        case "TimeoutError":
          return "timeout";
        case "ExternalError":
          return "external";
        case "InternalError":
          return "internal";
        default: {
          throw new Error("Exhaustive check failed");
        }
      }
    }

    expect(handleError(new ValidationError("test", []))).toBe("validation");
    expect(handleError(new NotFoundError("User", "123"))).toBe("not_found");
    expect(handleError(new PermissionError("denied"))).toBe("permission");
    expect(handleError(new ConflictError("conflict"))).toBe("conflict");
    expect(handleError(new RateLimitError("limited"))).toBe("rate_limit");
    expect(handleError(new TimeoutError("timed out"))).toBe("timeout");
    expect(handleError(new ExternalError("external fail"))).toBe("external");
    expect(handleError(new InternalError("internal fail"))).toBe("internal");
  });

  it("should route legacy classes through their base _tag", () => {
    function handleError(error: TemplarError): string {
      switch (error._tag) {
        case "ValidationError":
          return "validation";
        case "NotFoundError":
          return "not_found";
        case "PermissionError":
          return "permission";
        case "ConflictError":
          return "conflict";
        case "RateLimitError":
          return "rate_limit";
        case "TimeoutError":
          return "timeout";
        case "ExternalError":
          return "external";
        case "InternalError":
          return "internal";
        default:
          throw new Error("Exhaustive check failed");
      }
    }

    // Legacy classes get the base type's _tag
    expect(handleError(new AgentNotFoundError("abc"))).toBe("not_found");
    expect(handleError(new TokenExpiredError("test"))).toBe("permission");
  });
});

describe("Code-based discrimination (fine-grained)", () => {
  it("should enable fine-grained matching via .code", () => {
    function handleNotFound(error: TemplarError): string {
      if (error._tag !== "NotFoundError") return "not_a_not_found";

      // Fine-grained discrimination via .code
      switch (error.code) {
        case "AGENT_NOT_FOUND":
          return "agent_missing";
        case "RESOURCE_NOT_FOUND":
          return "resource_missing";
        case "WORKFLOW_NOT_FOUND":
          return "workflow_missing";
        default:
          return "other_not_found";
      }
    }

    const agentNotFound = new AgentNotFoundError("agent-456");
    const resourceNotFound = new NotFoundError("User", "user-123");
    const internal = new InternalError("test");

    expect(handleNotFound(agentNotFound)).toBe("agent_missing");
    expect(handleNotFound(resourceNotFound)).toBe("resource_missing");
    expect(handleNotFound(internal)).toBe("not_a_not_found");
  });

  it("should enable type narrowing with _tag + code", () => {
    const error: TemplarError = new AgentNotFoundError("agent-456");

    // Step 1: Narrow by _tag (category)
    if (error._tag === "NotFoundError") {
      expect(error.httpStatus).toBe(404);

      // Step 2: Narrow by code (specific error)
      if (error.code === "AGENT_NOT_FOUND") {
        expect((error as AgentNotFoundError).agentId).toBe("agent-456");
      }
    }
  });
});

describe("Discriminated union patterns", () => {
  it("should work with discriminated union patterns", () => {
    type ErrorResult<T> = { success: true; data: T } | { success: false; error: TemplarError };

    function processResult<T>(result: ErrorResult<T>): T {
      if (result.success) {
        return result.data;
      } else {
        throw result.error;
      }
    }

    const success: ErrorResult<string> = { success: true, data: "hello" };
    const failure: ErrorResult<string> = {
      success: false,
      error: new InternalError("failed"),
    };

    expect(processResult(success)).toBe("hello");
    expect(() => processResult(failure)).toThrow(InternalError);
  });
});
