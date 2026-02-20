import { describe, expect, it } from "vitest";
import {
  CodeExecutionTimeoutError,
  CodeModeError,
  CodeResourceExceededError,
  CodeRuntimeError,
  CodeSandboxNotFoundError,
  CodeSyntaxError,
  TemplarError,
} from "../../index.js";

describe("CodeModeError hierarchy", () => {
  describe("CodeSyntaxError", () => {
    it("should carry generatedCode and lineNumber", () => {
      const error = new CodeSyntaxError("print(", 1, "unexpected EOF");
      expect(error.generatedCode).toBe("print(");
      expect(error.lineNumber).toBe(1);
    });

    it("should have correct error code", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error.code).toBe("CODE_SYNTAX_ERROR");
    });

    it("should have HTTP status 400", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error.httpStatus).toBe(400);
    });

    it("should have _tag ValidationError", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error._tag).toBe("ValidationError");
    });

    it("should mention line number in message", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error.message).toContain("line 3");
    });

    it("should be isExpected", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error.isExpected).toBe(true);
    });

    it("should be instanceof CodeModeError and TemplarError", () => {
      const error = new CodeSyntaxError("x =", 3, "invalid syntax");
      expect(error).toBeInstanceOf(CodeModeError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("CodeRuntimeError", () => {
    it("should carry generatedCode and runtimeMessage", () => {
      const error = new CodeRuntimeError("1/0", "ZeroDivisionError: division by zero");
      expect(error.generatedCode).toBe("1/0");
      expect(error.runtimeMessage).toBe("ZeroDivisionError: division by zero");
    });

    it("should have correct error code", () => {
      const error = new CodeRuntimeError("1/0", "ZeroDivisionError");
      expect(error.code).toBe("CODE_RUNTIME_ERROR");
    });

    it("should have HTTP status 400", () => {
      const error = new CodeRuntimeError("1/0", "ZeroDivisionError");
      expect(error.httpStatus).toBe(400);
    });

    it("should have _tag ExternalError", () => {
      const error = new CodeRuntimeError("1/0", "ZeroDivisionError");
      expect(error._tag).toBe("ExternalError");
    });

    it("should be instanceof CodeModeError and TemplarError", () => {
      const error = new CodeRuntimeError("1/0", "ZeroDivisionError");
      expect(error).toBeInstanceOf(CodeModeError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("CodeExecutionTimeoutError", () => {
    it("should carry timeoutSeconds", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error.timeoutSeconds).toBe(30);
    });

    it("should have correct error code", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error.code).toBe("CODE_EXECUTION_TIMEOUT");
    });

    it("should have HTTP status 408", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error.httpStatus).toBe(408);
    });

    it("should have _tag TimeoutError", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error._tag).toBe("TimeoutError");
    });

    it("should mention timeout in message", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error.message).toContain("30s");
    });

    it("should be instanceof CodeModeError and TemplarError", () => {
      const error = new CodeExecutionTimeoutError(30);
      expect(error).toBeInstanceOf(CodeModeError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("CodeResourceExceededError", () => {
    it("should carry resource type", () => {
      const error = new CodeResourceExceededError("memory");
      expect(error.resource).toBe("memory");
    });

    it("should accept all resource types", () => {
      expect(new CodeResourceExceededError("memory").resource).toBe("memory");
      expect(new CodeResourceExceededError("allocations").resource).toBe("allocations");
      expect(new CodeResourceExceededError("recursion").resource).toBe("recursion");
    });

    it("should have correct error code", () => {
      const error = new CodeResourceExceededError("memory");
      expect(error.code).toBe("CODE_RESOURCE_EXCEEDED");
    });

    it("should have HTTP status 413", () => {
      const error = new CodeResourceExceededError("memory");
      expect(error.httpStatus).toBe(413);
    });

    it("should have _tag ExternalError", () => {
      const error = new CodeResourceExceededError("memory");
      expect(error._tag).toBe("ExternalError");
    });

    it("should be instanceof CodeModeError and TemplarError", () => {
      const error = new CodeResourceExceededError("memory");
      expect(error).toBeInstanceOf(CodeModeError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("CodeSandboxNotFoundError", () => {
    it("should carry sandboxId", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error.sandboxId).toBe("sbx-123");
    });

    it("should have correct error code", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error.code).toBe("CODE_SANDBOX_NOT_FOUND");
    });

    it("should have HTTP status 404", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error.httpStatus).toBe(404);
    });

    it("should have _tag NotFoundError", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error._tag).toBe("NotFoundError");
    });

    it("should mention sandboxId in message", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error.message).toContain("sbx-123");
    });

    it("should be instanceof CodeModeError and TemplarError", () => {
      const error = new CodeSandboxNotFoundError("sbx-123");
      expect(error).toBeInstanceOf(CodeModeError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("generic CodeModeError catch", () => {
    it("should catch all code-mode errors with instanceof CodeModeError", () => {
      const errors: CodeModeError[] = [
        new CodeSyntaxError("x =", 1, "invalid syntax"),
        new CodeRuntimeError("1/0", "ZeroDivisionError"),
        new CodeExecutionTimeoutError(30),
        new CodeResourceExceededError("memory"),
        new CodeSandboxNotFoundError("sbx-123"),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(CodeModeError);
        expect(error).toBeInstanceOf(TemplarError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should have domain 'code' for all code-mode errors", () => {
      const errors: CodeModeError[] = [
        new CodeSyntaxError("x =", 1, "invalid syntax"),
        new CodeRuntimeError("1/0", "ZeroDivisionError"),
        new CodeExecutionTimeoutError(30),
        new CodeResourceExceededError("memory"),
        new CodeSandboxNotFoundError("sbx-123"),
      ];

      for (const error of errors) {
        expect((error as unknown as { domain: string }).domain).toBe("code");
      }
    });
  });
});
