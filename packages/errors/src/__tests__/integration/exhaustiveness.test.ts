import { describe, it, expect } from "vitest";
import {
  TemplarError,
  InternalError,
  NotFoundError,
  ValidationError,
  AgentNotFoundError,
  TokenExpiredError,
} from "../../index.js";

describe("Exhaustive type checking with _tag discriminant", () => {
  it("should enable exhaustive switch statements", () => {
    function handleError(error: TemplarError): string {
      switch (error._tag) {
        case "InternalError":
          return "internal";
        case "NotImplementedError":
          return "not_implemented";
        case "ServiceUnavailableError":
          return "unavailable";
        case "TimeoutError":
          return "timeout";
        case "TokenExpiredError":
          return "token_expired";
        case "TokenInvalidError":
          return "token_invalid";
        case "TokenMissingError":
          return "token_missing";
        case "InsufficientScopeError":
          return "insufficient_scope";
        case "ForbiddenError":
          return "forbidden";
        case "NotFoundError":
          return "not_found";
        case "AlreadyExistsError":
          return "already_exists";
        case "ResourceConflictError":
          return "conflict";
        case "ResourceGoneError":
          return "gone";
        case "ValidationError":
          return "validation";
        case "RequiredFieldError":
          return "required_field";
        case "InvalidFormatError":
          return "invalid_format";
        case "OutOfRangeError":
          return "out_of_range";
        case "AgentNotFoundError":
          return "agent_not_found";
        case "AgentExecutionError":
          return "agent_execution";
        case "AgentTimeoutError":
          return "agent_timeout";
        case "AgentInvalidStateError":
          return "agent_invalid_state";
        case "AgentConfigurationError":
          return "agent_config";
        case "WorkflowNotFoundError":
          return "workflow_not_found";
        case "WorkflowExecutionError":
          return "workflow_execution";
        case "WorkflowInvalidStateError":
          return "workflow_invalid_state";
        case "WorkflowStepError":
          return "workflow_step";
        case "DeploymentError":
          return "deployment";
        case "DeploymentNotFoundError":
          return "deployment_not_found";
        case "DeploymentConfigError":
          return "deployment_config";
        case "QuotaExceededError":
          return "quota_exceeded";
        case "RateLimitExceededError":
          return "rate_limit";
        case "PayloadTooLargeError":
          return "payload_too_large";
        default:
          // This line would cause a compile error if we missed a case
          const _exhaustive: never = error;
          return _exhaustive;
      }
    }

    // Test a few cases
    expect(handleError(new InternalError("test"))).toBe("internal");
    expect(handleError(new NotFoundError("User", "123"))).toBe("not_found");
    expect(handleError(new ValidationError("test", []))).toBe("validation");
    expect(handleError(new AgentNotFoundError("abc"))).toBe("agent_not_found");
    expect(handleError(new TokenExpiredError("test"))).toBe("token_expired");
  });

  it("should enable type narrowing with _tag", () => {
    function getResourceId(error: TemplarError): string | undefined {
      if (error._tag === "NotFoundError") {
        // TypeScript narrows to NotFoundError here
        return error.resourceId;
      }

      if (error._tag === "AgentNotFoundError") {
        // TypeScript narrows to AgentNotFoundError here
        return error.agentId;
      }

      return undefined;
    }

    const notFound = new NotFoundError("User", "user-123");
    const agentNotFound = new AgentNotFoundError("agent-456");
    const internal = new InternalError("test");

    expect(getResourceId(notFound)).toBe("user-123");
    expect(getResourceId(agentNotFound)).toBe("agent-456");
    expect(getResourceId(internal)).toBeUndefined();
  });

  it("should work with discriminated union patterns", () => {
    type ErrorResult<T> =
      | { success: true; data: T }
      | { success: false; error: TemplarError };

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

describe("Type inference from _tag", () => {
  it("should infer correct type from _tag literal", () => {
    const error: TemplarError = new AgentNotFoundError("test");

    // This function expects the type to be inferred correctly
    function requireAgentError(e: { _tag: "AgentNotFoundError"; agentId: string }) {
      return e.agentId;
    }

    if (error._tag === "AgentNotFoundError") {
      // TypeScript knows error is AgentNotFoundError here
      expect(requireAgentError(error)).toBe("test");
    }
  });
});
