import { describe, expect, it } from "vitest";
import {
  ERROR_CATALOG,
  getAllErrorCodes,
  getCatalogEntry,
  getErrorCodesByDomain,
  isClientError,
  isErrorStatus,
  isServerError,
  isValidErrorCode,
  validateCatalog,
} from "../../index.js";

describe("ERROR_CATALOG", () => {
  it("should have all expected domains", () => {
    const domains = new Set(Object.values(ERROR_CATALOG).map((e) => e.domain));

    expect(domains).toContain("internal");
    expect(domains).toContain("auth");
    expect(domains).toContain("resource");
    expect(domains).toContain("validation");
    expect(domains).toContain("agent");
    expect(domains).toContain("workflow");
    expect(domains).toContain("deployment");
    expect(domains).toContain("quota");
  });

  it("should have valid HTTP status codes for all entries", () => {
    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.httpStatus).toBeGreaterThanOrEqual(100);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(entry.httpStatus).toBe(Math.floor(entry.httpStatus)); // integer
    }
  });

  it("should have valid gRPC codes for all entries", () => {
    const validGrpcCodes = [
      "OK",
      "CANCELLED",
      "UNKNOWN",
      "INVALID_ARGUMENT",
      "DEADLINE_EXCEEDED",
      "NOT_FOUND",
      "ALREADY_EXISTS",
      "PERMISSION_DENIED",
      "RESOURCE_EXHAUSTED",
      "FAILED_PRECONDITION",
      "ABORTED",
      "OUT_OF_RANGE",
      "UNIMPLEMENTED",
      "INTERNAL",
      "UNAVAILABLE",
      "DATA_LOSS",
      "UNAUTHENTICATED",
    ];

    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(validGrpcCodes).toContain(entry.grpcCode);
    }
  });

  it("should have UPPER_SNAKE_CASE codes", () => {
    for (const code of Object.keys(ERROR_CATALOG)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("should have titles and descriptions for all entries", () => {
    for (const [_code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.title).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.description).toBe("string");
    }
  });

  it("should have domain prefixes matching domain (with exceptions)", () => {
    // Exceptions: Some domains have multiple logical prefixes
    // - quota domain includes: QUOTA_, RATE_, PAYLOAD_
    const exceptions = new Set([
      "RATE_LIMIT_EXCEEDED", // quota domain, but RATE prefix
      "PAYLOAD_TOO_LARGE", // quota domain, but PAYLOAD prefix
      "SELF_TEST_HEALTH_CHECK_FAILED", // selftest domain, SELF prefix (compound)
      "SELF_TEST_VERIFICATION_FAILED", // selftest domain, SELF prefix (compound)
      "SELF_TEST_TIMEOUT", // selftest domain, SELF prefix (compound)
      "SELF_TEST_CONFIGURATION_INVALID", // selftest domain, SELF prefix (compound)
      "HUMAN_DELAY_CONFIGURATION_INVALID", // channel domain, HUMAN prefix (compound)
      "EXEC_APPROVAL_COMMAND_BLOCKED", // exec-approval domain, EXEC prefix (compound)
      "EXEC_APPROVAL_DENIED", // exec-approval domain, EXEC prefix (compound)
      "EXEC_APPROVAL_PARSE_FAILED", // exec-approval domain, EXEC prefix (compound)
      "EXEC_APPROVAL_CONFIGURATION_INVALID", // exec-approval domain, EXEC prefix (compound)
      "EXEC_APPROVAL_SYNC_FAILED", // exec-approval domain, EXEC prefix (compound)
      "EXEC_APPROVAL_POLICY_FETCH_FAILED", // exec-approval domain, EXEC prefix (compound)
      "REACTION_PATTERN_INVALID", // collaboration domain, REACTION prefix (sub-component)
      "REACTION_COOLDOWN_ACTIVE", // collaboration domain, REACTION prefix (sub-component)
      "REACTION_EVENT_SOURCE_FAILED", // collaboration domain, REACTION prefix (sub-component)
      "VOICE_DRIFT_EXCEEDED", // collaboration domain, VOICE prefix (sub-component)
      "VOICE_MEMORY_QUERY_FAILED", // collaboration domain, VOICE prefix (sub-component)
      "VOICE_MODIFIER_UPDATE_TIMEOUT", // collaboration domain, VOICE prefix (sub-component)
      "DISTILLATION_EXTRACTION_FAILED", // collaboration domain, DISTILLATION prefix (sub-component)
      "DISTILLATION_EXTRACTION_TIMEOUT", // collaboration domain, DISTILLATION prefix (sub-component)
    ]);

    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      if (exceptions.has(code)) {
        continue; // Skip exceptions
      }

      const prefix = code.split("_")[0];
      // Internal errors have INTERNAL prefix
      // Other domains should match
      if (entry.domain !== "internal") {
        if (prefix) expect(prefix.toLowerCase()).toBe(entry.domain);
      }
    }
  });
});

describe("getAllErrorCodes", () => {
  it("should return all error codes", () => {
    const codes = getAllErrorCodes();

    expect(codes).toContain("INTERNAL_ERROR");
    expect(codes).toContain("AUTH_TOKEN_EXPIRED");
    expect(codes).toContain("AGENT_NOT_FOUND");
    expect(codes).toContain("WORKFLOW_INVALID_STATE");
    expect(codes.length).toBeGreaterThan(30);
  });
});

describe("getErrorCodesByDomain", () => {
  it("should return error codes for auth domain", () => {
    const authCodes = getErrorCodesByDomain("auth");

    expect(authCodes).toContain("AUTH_TOKEN_EXPIRED");
    expect(authCodes).toContain("AUTH_TOKEN_INVALID");
    expect(authCodes).toContain("AUTH_FORBIDDEN");
    expect(authCodes.every((code) => code.startsWith("AUTH_"))).toBe(true);
  });

  it("should return error codes for agent domain", () => {
    const agentCodes = getErrorCodesByDomain("agent");

    expect(agentCodes).toContain("AGENT_NOT_FOUND");
    expect(agentCodes).toContain("AGENT_EXECUTION_FAILED");
    expect(agentCodes.every((code) => code.startsWith("AGENT_"))).toBe(true);
  });

  it("should return empty array for unknown domain", () => {
    const codes = getErrorCodesByDomain("nonexistent");
    expect(codes).toEqual([]);
  });
});

describe("getCatalogEntry", () => {
  it("should return catalog entry for valid code", () => {
    const entry = getCatalogEntry("AGENT_NOT_FOUND");

    expect(entry.domain).toBe("agent");
    expect(entry.httpStatus).toBe(404);
    expect(entry.grpcCode).toBe("NOT_FOUND");
    expect(entry.title).toBeTruthy();
  });
});

describe("isValidErrorCode", () => {
  it("should return true for valid codes", () => {
    expect(isValidErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(isValidErrorCode("AGENT_NOT_FOUND")).toBe(true);
    expect(isValidErrorCode("QUOTA_EXCEEDED")).toBe(true);
  });

  it("should return false for invalid codes", () => {
    expect(isValidErrorCode("INVALID_CODE")).toBe(false);
    expect(isValidErrorCode("")).toBe(false);
    expect(isValidErrorCode("random_string")).toBe(false);
  });
});

describe("validateCatalog", () => {
  it("should validate catalog structure", () => {
    const result = validateCatalog();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should detect naming violations (if any)", () => {
    // This test documents that our catalog follows conventions
    const result = validateCatalog();

    for (const error of result.errors) {
      // All codes should be UPPER_SNAKE_CASE
      expect(error).not.toContain("not in UPPER_SNAKE_CASE");
    }
  });

  it("should detect invalid HTTP status codes (if any)", () => {
    const result = validateCatalog();

    for (const error of result.errors) {
      // All HTTP status codes should be valid
      expect(error).not.toContain("invalid HTTP status");
    }
  });
});

describe("HTTP status helpers", () => {
  it("should identify error status codes", () => {
    expect(isErrorStatus(200)).toBe(false);
    expect(isErrorStatus(299)).toBe(false);
    expect(isErrorStatus(400)).toBe(true);
    expect(isErrorStatus(404)).toBe(true);
    expect(isErrorStatus(500)).toBe(true);
  });

  it("should identify client errors (4xx)", () => {
    expect(isClientError(400)).toBe(true);
    expect(isClientError(404)).toBe(true);
    expect(isClientError(499)).toBe(true);
    expect(isClientError(399)).toBe(false);
    expect(isClientError(500)).toBe(false);
  });

  it("should identify server errors (5xx)", () => {
    expect(isServerError(500)).toBe(true);
    expect(isServerError(503)).toBe(true);
    expect(isServerError(599)).toBe(true);
    expect(isServerError(400)).toBe(false);
    expect(isServerError(600)).toBe(false);
  });
});
