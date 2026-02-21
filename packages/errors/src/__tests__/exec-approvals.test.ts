import { describe, expect, it } from "vitest";
import { TemplarError } from "../base.js";
import { ERROR_CATALOG } from "../catalog.js";
import {
  ExecApprovalCommandBlockedError,
  ExecApprovalConfigurationError,
  ExecApprovalDeniedError,
  ExecApprovalError,
  ExecApprovalParseError,
} from "../exec-approvals.js";

describe("ExecApprovalError hierarchy", () => {
  describe("ExecApprovalCommandBlockedError", () => {
    it("should extend ExecApprovalError and TemplarError", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /", "rm -rf /");
      expect(error).toBeInstanceOf(ExecApprovalError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /", "rm -rf /");
      const entry = ERROR_CATALOG.EXEC_APPROVAL_COMMAND_BLOCKED;
      expect(error.code).toBe("EXEC_APPROVAL_COMMAND_BLOCKED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /", "rm -rf /");
      expect(error._tag).toBe("PermissionError");
    });

    it("should store constructor args", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /home", "rm -rf /");
      expect(error.command).toBe("rm -rf /home");
      expect(error.matchedPattern).toBe("rm -rf /");
    });

    it("should include command and pattern in message", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /", "rm -rf /");
      expect(error.message).toBe(
        'Command blocked: "rm -rf /" matched NEVER_ALLOW pattern "rm -rf /"',
      );
    });

    it("should serialize to JSON", () => {
      const error = new ExecApprovalCommandBlockedError("rm -rf /", "rm -rf /");
      const json = error.toJSON();
      expect(json.code).toBe("EXEC_APPROVAL_COMMAND_BLOCKED");
      expect(json._tag).toBe("PermissionError");
      expect(json.domain).toBe("exec-approval");
    });
  });

  describe("ExecApprovalDeniedError", () => {
    it("should extend ExecApprovalError and TemplarError", () => {
      const error = new ExecApprovalDeniedError("curl evil.com", "agent-1", "untrusted domain");
      expect(error).toBeInstanceOf(ExecApprovalError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new ExecApprovalDeniedError("curl evil.com", "agent-1", "untrusted domain");
      const entry = ERROR_CATALOG.EXEC_APPROVAL_DENIED;
      expect(error.code).toBe("EXEC_APPROVAL_DENIED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new ExecApprovalDeniedError("curl evil.com", "agent-1", "untrusted domain");
      expect(error._tag).toBe("PermissionError");
    });

    it("should store constructor args", () => {
      const error = new ExecApprovalDeniedError("curl evil.com", "agent-1", "untrusted domain");
      expect(error.command).toBe("curl evil.com");
      expect(error.agentId).toBe("agent-1");
      expect(error.reason).toBe("untrusted domain");
    });

    it("should include details in message", () => {
      const error = new ExecApprovalDeniedError("curl evil.com", "agent-1", "untrusted domain");
      expect(error.message).toBe(
        'Command denied: "curl evil.com" for agent agent-1 — untrusted domain',
      );
    });
  });

  describe("ExecApprovalParseError", () => {
    it("should extend ExecApprovalError and TemplarError", () => {
      const error = new ExecApprovalParseError('bad " command', "unterminated quote");
      expect(error).toBeInstanceOf(ExecApprovalError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new ExecApprovalParseError("bad command", "unexpected token");
      const entry = ERROR_CATALOG.EXEC_APPROVAL_PARSE_FAILED;
      expect(error.code).toBe("EXEC_APPROVAL_PARSE_FAILED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new ExecApprovalParseError("bad command", "unexpected token");
      expect(error._tag).toBe("ValidationError");
    });

    it("should store constructor args", () => {
      const error = new ExecApprovalParseError('bad " command', "unterminated quote");
      expect(error.rawCommand).toBe('bad " command');
      expect(error.parseError).toBe("unterminated quote");
    });

    it("should include parse error in message", () => {
      const error = new ExecApprovalParseError("bad command", "unexpected token");
      expect(error.message).toBe("Command parse failed: unexpected token");
    });
  });

  describe("ExecApprovalConfigurationError", () => {
    it("should extend ExecApprovalError and TemplarError", () => {
      const error = new ExecApprovalConfigurationError("threshold must be >= 1");
      expect(error).toBeInstanceOf(ExecApprovalError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new ExecApprovalConfigurationError("threshold must be >= 1");
      const entry = ERROR_CATALOG.EXEC_APPROVAL_CONFIGURATION_INVALID;
      expect(error.code).toBe("EXEC_APPROVAL_CONFIGURATION_INVALID");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new ExecApprovalConfigurationError("bad config");
      expect(error._tag).toBe("ValidationError");
    });

    it("should include validation message", () => {
      const error = new ExecApprovalConfigurationError("threshold must be >= 1");
      expect(error.message).toBe("Invalid exec-approval configuration: threshold must be >= 1");
    });

    it("should serialize to JSON", () => {
      const error = new ExecApprovalConfigurationError("bad config");
      const json = error.toJSON();
      expect(json.code).toBe("EXEC_APPROVAL_CONFIGURATION_INVALID");
      expect(json._tag).toBe("ValidationError");
      expect(json.domain).toBe("exec-approval");
    });
  });
});
