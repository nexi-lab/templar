import { describe, expect, it } from "vitest";
import { TemplarError } from "../base.js";
import { ERROR_CATALOG } from "../catalog.js";
import {
  SelfTestConfigurationInvalidError,
  SelfTestError,
  SelfTestHealthCheckFailedError,
  SelfTestTimeoutError,
  SelfTestVerificationFailedError,
} from "../self-test.js";

describe("SelfTestError hierarchy", () => {
  describe("SelfTestHealthCheckFailedError", () => {
    it("should extend SelfTestError and TemplarError", () => {
      const error = new SelfTestHealthCheckFailedError(
        "health-check",
        "http://localhost:3000/health",
      );
      expect(error).toBeInstanceOf(SelfTestError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new SelfTestHealthCheckFailedError(
        "health-check",
        "http://localhost:3000/health",
      );
      const entry = ERROR_CATALOG.SELF_TEST_HEALTH_CHECK_FAILED;
      expect(error.code).toBe("SELF_TEST_HEALTH_CHECK_FAILED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new SelfTestHealthCheckFailedError(
        "health-check",
        "http://localhost:3000/health",
      );
      expect(error._tag).toBe("SelfTestError");
    });

    it("should store constructor args", () => {
      const error = new SelfTestHealthCheckFailedError(
        "api-check",
        "http://localhost:8080/api",
        503,
      );
      expect(error.verifierName).toBe("api-check");
      expect(error.url).toBe("http://localhost:8080/api");
      expect(error.lastStatus).toBe(503);
    });

    it("should handle undefined lastStatus", () => {
      const error = new SelfTestHealthCheckFailedError("check", "http://localhost:3000");
      expect(error.lastStatus).toBeUndefined();
      expect(error.message).toBe("Health check failed: check at http://localhost:3000");
    });

    it("should include lastStatus in message when provided", () => {
      const error = new SelfTestHealthCheckFailedError("check", "http://localhost:3000", 503);
      expect(error.message).toBe(
        "Health check failed: check at http://localhost:3000 (last status: 503)",
      );
    });

    it("should serialize to JSON", () => {
      const error = new SelfTestHealthCheckFailedError("check", "http://localhost:3000");
      const json = error.toJSON();
      expect(json.code).toBe("SELF_TEST_HEALTH_CHECK_FAILED");
      expect(json._tag).toBe("SelfTestError");
      expect(json.domain).toBe("selftest");
    });
  });

  describe("SelfTestVerificationFailedError", () => {
    const failedAssertions = [
      { name: "status-check", passed: false, message: "Expected 200, got 500" },
      { name: "body-check", passed: false, expected: "ok", actual: "error" },
    ];
    const report = {
      results: { summary: { tests: 5, passed: 3, failed: 2 } },
    };

    it("should extend SelfTestError and TemplarError", () => {
      const error = new SelfTestVerificationFailedError("api-test", failedAssertions, report);
      expect(error).toBeInstanceOf(SelfTestError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new SelfTestVerificationFailedError("api-test", failedAssertions, report);
      const entry = ERROR_CATALOG.SELF_TEST_VERIFICATION_FAILED;
      expect(error.code).toBe("SELF_TEST_VERIFICATION_FAILED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should store constructor args", () => {
      const error = new SelfTestVerificationFailedError("api-test", failedAssertions, report);
      expect(error.verifierName).toBe("api-test");
      expect(error.failedAssertions).toBe(failedAssertions);
      expect(error.report).toBe(report);
    });

    it("should pluralize assertion count in message", () => {
      const error = new SelfTestVerificationFailedError("test", failedAssertions, report);
      expect(error.message).toContain("2 assertions failed");
    });

    it("should singularize for one assertion", () => {
      const single = [failedAssertions[0]!];
      const error = new SelfTestVerificationFailedError("test", single, report);
      expect(error.message).toContain("1 assertion failed");
    });
  });

  describe("SelfTestTimeoutError", () => {
    it("should extend SelfTestError and TemplarError", () => {
      const error = new SelfTestTimeoutError("browser-test", 30_000, 31_000);
      expect(error).toBeInstanceOf(SelfTestError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new SelfTestTimeoutError("browser-test", 30_000, 31_000);
      const entry = ERROR_CATALOG.SELF_TEST_TIMEOUT;
      expect(error.code).toBe("SELF_TEST_TIMEOUT");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should store constructor args", () => {
      const error = new SelfTestTimeoutError("browser-test", 30_000, 31_000);
      expect(error.verifierName).toBe("browser-test");
      expect(error.timeoutMs).toBe(30_000);
      expect(error.elapsedMs).toBe(31_000);
    });

    it("should include timing in message", () => {
      const error = new SelfTestTimeoutError("test", 5000, 6000);
      expect(error.message).toBe("Self-test timeout: test exceeded 5000ms (elapsed: 6000ms)");
    });
  });

  describe("SelfTestConfigurationInvalidError", () => {
    it("should extend SelfTestError and TemplarError", () => {
      const error = new SelfTestConfigurationInvalidError(["workspace missing"]);
      expect(error).toBeInstanceOf(SelfTestError);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should map to catalog entry", () => {
      const error = new SelfTestConfigurationInvalidError(["workspace missing"]);
      const entry = ERROR_CATALOG.SELF_TEST_CONFIGURATION_INVALID;
      expect(error.code).toBe("SELF_TEST_CONFIGURATION_INVALID");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should store validation errors", () => {
      const errors = ["workspace missing", "invalid url"];
      const error = new SelfTestConfigurationInvalidError(errors);
      expect(error.validationErrors).toBe(errors);
    });

    it("should join errors in message", () => {
      const error = new SelfTestConfigurationInvalidError(["a", "b"]);
      expect(error.message).toBe("Invalid self-test configuration: a; b");
    });
  });
});
