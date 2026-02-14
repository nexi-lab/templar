import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ERROR_CATALOG,
  ExternalError,
  getAllErrorCodes,
  hasCode,
  InternalError,
  isConflictError,
  isExpectedError,
  isExternalError,
  isInternalError,
  isNotFoundError,
  isPermissionError,
  isRateLimitError,
  isTimeoutError,
  isValidationError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  TemplarError,
  TimeoutError,
  ValidationError,
  wrapError,
} from "../../index.js";

// ============================================================================
// 8 BASE TYPES — CONSTRUCTION VIA OPTIONS OBJECT
// ============================================================================

describe("8 base types — options object constructor", () => {
  it("ValidationError with code + issues", () => {
    const error = new ValidationError({
      code: "VALIDATION_FAILED",
      message: "Invalid input",
      metadata: { field: "email" },
      traceId: "t1",
      issues: [{ field: "email", message: "bad format", code: "FORMAT" }],
    });

    expect(error._tag).toBe("ValidationError");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.httpStatus).toBe(400);
    expect(error.grpcCode).toBe("INVALID_ARGUMENT");
    expect(error.domain).toBe("validation");
    expect(error.isExpected).toBe(true);
    expect(error.issues).toHaveLength(1);
    expect(error.metadata).toEqual({ field: "email" });
    expect(error.traceId).toBe("t1");
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(TemplarError);
    expect(error).toBeInstanceOf(Error);
  });

  it("NotFoundError with specific code", () => {
    const error = new NotFoundError({
      code: "AGENT_NOT_FOUND",
      message: "Agent abc not found",
    });

    expect(error._tag).toBe("NotFoundError");
    expect(error.code).toBe("AGENT_NOT_FOUND");
    expect(error.httpStatus).toBe(404);
    expect(error.domain).toBe("agent");
    expect(error.isExpected).toBe(true);
  });

  it("PermissionError", () => {
    const error = new PermissionError({
      code: "AUTH_TOKEN_EXPIRED",
      message: "Token expired",
    });

    expect(error._tag).toBe("PermissionError");
    expect(error.code).toBe("AUTH_TOKEN_EXPIRED");
    expect(error.httpStatus).toBe(401);
    expect(error.grpcCode).toBe("UNAUTHENTICATED");
    expect(error.isExpected).toBe(true);
  });

  it("ConflictError", () => {
    const error = new ConflictError({
      code: "RESOURCE_CONFLICT",
      message: "Version mismatch",
    });

    expect(error._tag).toBe("ConflictError");
    expect(error.code).toBe("RESOURCE_CONFLICT");
    expect(error.httpStatus).toBe(409);
    expect(error.isExpected).toBe(true);
  });

  it("RateLimitError", () => {
    const error = new RateLimitError({
      code: "QUOTA_EXCEEDED",
      message: "Rate limit hit",
    });

    expect(error._tag).toBe("RateLimitError");
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.httpStatus).toBe(429);
    expect(error.isExpected).toBe(true);
  });

  it("TimeoutError", () => {
    const error = new TimeoutError({
      code: "INTERNAL_TIMEOUT",
      message: "Operation timed out",
    });

    expect(error._tag).toBe("TimeoutError");
    expect(error.code).toBe("INTERNAL_TIMEOUT");
    expect(error.httpStatus).toBe(504);
    expect(error.isExpected).toBe(false);
  });

  it("ExternalError", () => {
    const error = new ExternalError({
      code: "AGENT_EXECUTION_FAILED",
      message: "Execution failed",
    });

    expect(error._tag).toBe("ExternalError");
    expect(error.code).toBe("AGENT_EXECUTION_FAILED");
    expect(error.httpStatus).toBe(500);
    expect(error.isExpected).toBe(false);
  });

  it("InternalError", () => {
    const error = new InternalError({
      code: "INTERNAL_NOT_IMPLEMENTED",
      message: "Not implemented",
    });

    expect(error._tag).toBe("InternalError");
    expect(error.code).toBe("INTERNAL_NOT_IMPLEMENTED");
    expect(error.httpStatus).toBe(501);
    expect(error.isExpected).toBe(false);
  });
});

// ============================================================================
// POSITIONAL CONSTRUCTORS
// ============================================================================

describe("Positional constructors", () => {
  it("InternalError positional defaults to INTERNAL_ERROR", () => {
    const error = new InternalError("something broke");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.httpStatus).toBe(500);
  });

  it("ValidationError positional defaults to VALIDATION_FAILED", () => {
    const issues = [{ field: "name", message: "required", code: "REQUIRED" }];
    const error = new ValidationError("bad input", issues, { src: "api" }, "t1");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.issues).toEqual(issues);
    expect(error.metadata).toEqual({ src: "api" });
    expect(error.traceId).toBe("t1");
  });

  it("NotFoundError positional defaults to RESOURCE_NOT_FOUND", () => {
    const error = new NotFoundError("User", "u123", { env: "prod" }, "t2");
    expect(error.code).toBe("RESOURCE_NOT_FOUND");
    expect(error.message).toBe("User with ID 'u123' not found");
    expect(error.metadata).toEqual({ env: "prod" });
  });

  it("PermissionError positional defaults to PERMISSION_DENIED", () => {
    const error = new PermissionError("access denied");
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.httpStatus).toBe(403);
  });

  it("ConflictError positional defaults to RESOURCE_CONFLICT", () => {
    const error = new ConflictError("already exists");
    expect(error.code).toBe("RESOURCE_CONFLICT");
  });

  it("RateLimitError positional defaults to RATE_LIMIT_EXCEEDED", () => {
    const error = new RateLimitError("too many requests");
    expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("TimeoutError positional defaults to INTERNAL_TIMEOUT", () => {
    const error = new TimeoutError("deadline exceeded");
    expect(error.code).toBe("INTERNAL_TIMEOUT");
  });

  it("ExternalError positional defaults to INTERNAL_UNAVAILABLE", () => {
    const error = new ExternalError("service down");
    expect(error.code).toBe("INTERNAL_UNAVAILABLE");
  });
});

// ============================================================================
// CAUSE CHAINING
// ============================================================================

describe("Error cause chaining", () => {
  it("should support cause via options object", () => {
    const cause = new Error("root cause");
    const error = new InternalError({
      code: "INTERNAL_ERROR",
      message: "wrapped",
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

describe("Type guards", () => {
  const errors = {
    validation: new ValidationError("v"),
    notFound: new NotFoundError("R", "1"),
    permission: new PermissionError("p"),
    conflict: new ConflictError("c"),
    rateLimit: new RateLimitError("r"),
    timeout: new TimeoutError("t"),
    external: new ExternalError("e"),
    internal: new InternalError("i"),
  };

  it("isValidationError", () => {
    expect(isValidationError(errors.validation)).toBe(true);
    expect(isValidationError(errors.internal)).toBe(false);
    expect(isValidationError(new Error("x"))).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });

  it("isNotFoundError", () => {
    expect(isNotFoundError(errors.notFound)).toBe(true);
    expect(isNotFoundError(errors.internal)).toBe(false);
  });

  it("isPermissionError", () => {
    expect(isPermissionError(errors.permission)).toBe(true);
    expect(isPermissionError(errors.internal)).toBe(false);
  });

  it("isConflictError", () => {
    expect(isConflictError(errors.conflict)).toBe(true);
    expect(isConflictError(errors.internal)).toBe(false);
  });

  it("isRateLimitError", () => {
    expect(isRateLimitError(errors.rateLimit)).toBe(true);
    expect(isRateLimitError(errors.internal)).toBe(false);
  });

  it("isTimeoutError", () => {
    expect(isTimeoutError(errors.timeout)).toBe(true);
    expect(isTimeoutError(errors.internal)).toBe(false);
  });

  it("isExternalError", () => {
    expect(isExternalError(errors.external)).toBe(true);
    expect(isExternalError(errors.internal)).toBe(false);
  });

  it("isInternalError", () => {
    expect(isInternalError(errors.internal)).toBe(true);
    expect(isInternalError(errors.validation)).toBe(false);
  });

  it("hasCode narrows to specific code", () => {
    const error = new NotFoundError({
      code: "AGENT_NOT_FOUND",
      message: "Agent missing",
    });

    expect(hasCode(error, "AGENT_NOT_FOUND")).toBe(true);
    expect(hasCode(error, "RESOURCE_NOT_FOUND")).toBe(false);
  });

  it("isExpectedError returns true for 4xx errors", () => {
    expect(isExpectedError(errors.validation)).toBe(true);
    expect(isExpectedError(errors.notFound)).toBe(true);
    expect(isExpectedError(errors.permission)).toBe(true);
    expect(isExpectedError(errors.conflict)).toBe(true);
    expect(isExpectedError(errors.rateLimit)).toBe(true);
  });

  it("isExpectedError returns false for 5xx errors", () => {
    expect(isExpectedError(errors.timeout)).toBe(false);
    expect(isExpectedError(errors.external)).toBe(false);
    expect(isExpectedError(errors.internal)).toBe(false);
  });

  it("isExpectedError returns false for non-TemplarError", () => {
    expect(isExpectedError(new Error("x"))).toBe(false);
    expect(isExpectedError(null)).toBe(false);
    expect(isExpectedError("string")).toBe(false);
  });
});

// ============================================================================
// CATALOG BASETYPE MAPPING
// ============================================================================

describe("Catalog baseType consistency", () => {
  it("every error code has a valid baseType", () => {
    const validBaseTypes = new Set([
      "ValidationError",
      "NotFoundError",
      "PermissionError",
      "ConflictError",
      "RateLimitError",
      "TimeoutError",
      "ExternalError",
      "InternalError",
    ]);

    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(validBaseTypes.has(entry.baseType)).toBe(true);
    }
  });

  it("every error code has an isExpected boolean", () => {
    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(typeof entry.isExpected).toBe("boolean");
    }
  });

  it("4xx HTTP codes should generally be isExpected=true", () => {
    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      if (entry.httpStatus >= 400 && entry.httpStatus < 500) {
        expect(entry.isExpected).toBe(true);
      }
    }
  });

  it("5xx HTTP codes should mostly be isExpected=false (with known exceptions)", () => {
    // Some 5xx codes like AGUI_CONNECTION_LIMIT_REACHED (503) are expected
    // because they represent retriable conditions, not bugs.
    const expectedExceptions = new Set(["AGUI_CONNECTION_LIMIT_REACHED"]);

    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      if (entry.httpStatus >= 500 && !expectedExceptions.has(code)) {
        expect(entry.isExpected).toBe(false);
      }
    }
  });

  it("constructs correct base type for every catalog code", () => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic constructor map requires any
    const baseTypeToClass: Record<string, new (opts: any) => TemplarError> = {
      ValidationError,
      NotFoundError,
      PermissionError,
      ConflictError,
      RateLimitError,
      TimeoutError,
      ExternalError,
      InternalError,
    };

    for (const code of getAllErrorCodes()) {
      const entry = ERROR_CATALOG[code];
      const ErrorClass = baseTypeToClass[entry.baseType];
      expect(ErrorClass).toBeDefined();

      const error = new ErrorClass({
        code,
        message: `Test ${code}`,
      });

      expect(error._tag).toBe(entry.baseType);
      expect(error.code).toBe(code);
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    }
  });
});

// ============================================================================
// WRAPPERROR
// ============================================================================

describe("wrapError", () => {
  it("passes through TemplarError as-is", () => {
    const original = new ValidationError("test");
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it("wraps Error in InternalError", () => {
    const original = new Error("native error");
    const wrapped = wrapError(original, "trace-1");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).toBe("native error");
    expect(wrapped.traceId).toBe("trace-1");
  });

  it("wraps string in InternalError", () => {
    const wrapped = wrapError("string error");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).toBe("string error");
  });

  it("wraps unknown in InternalError", () => {
    const wrapped = wrapError(42);
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).toBe("An unknown error occurred");
  });
});
