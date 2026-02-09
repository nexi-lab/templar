import { describe, expect, it } from "vitest";
import {
  InternalError,
  ManifestValidationError,
  NexusClientError,
  PACKAGE_NAME,
  TemplarConfigError,
  TemplarError,
} from "../index.js";

describe("@templar/errors", () => {
  it("should export package name", () => {
    expect(PACKAGE_NAME).toBe("@templar/errors");
  });

  describe("TemplarError base class", () => {
    it("should create error with message", () => {
      // Use InternalError as concrete implementation
      const error = new InternalError("test error");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error.message).toBe("test error");
      expect(error.name).toBe("InternalError");
    });

    it("should preserve stack trace", () => {
      const error = new InternalError("test error");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("InternalError");
    });

    it("should support metadata and traceId", () => {
      const error = new InternalError("test error", { userId: "123" }, "trace-abc");
      expect(error.metadata).toEqual({ userId: "123" });
      expect(error.traceId).toBe("trace-abc");
    });
  });

  describe("TemplarConfigError", () => {
    it("should extend TemplarError", () => {
      const error = new TemplarConfigError("config error");
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(TemplarConfigError);
      expect(error.name).toBe("TemplarConfigError");
    });

    it("should have correct message", () => {
      const error = new TemplarConfigError("invalid config");
      expect(error.message).toBe("invalid config");
    });

    it("should support cause chaining", () => {
      const cause = new Error("validation failed");
      const error = new TemplarConfigError("config error", { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe("NexusClientError", () => {
    it("should extend TemplarError", () => {
      const error = new NexusClientError("nexus error");
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(NexusClientError);
      expect(error.name).toBe("NexusClientError");
    });

    it("should have correct message", () => {
      const error = new NexusClientError("client not initialized");
      expect(error.message).toBe("client not initialized");
    });
  });

  describe("ManifestValidationError", () => {
    it("should extend TemplarError", () => {
      const error = new ManifestValidationError("manifest error");
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(ManifestValidationError);
      expect(error.name).toBe("ManifestValidationError");
    });

    it("should have correct message", () => {
      const error = new ManifestValidationError("missing required field");
      expect(error.message).toBe("missing required field");
    });
  });
});
