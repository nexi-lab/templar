import { describe, expect, it } from "vitest";
import { TemplarError } from "../base.js";
import { ERROR_CATALOG } from "../catalog.js";
import {
  ContextHydrationError,
  HydrationSourceFailedError,
  HydrationTimeoutError,
} from "../context-hydration.js";

describe("ContextHydrationError hierarchy", () => {
  describe("HydrationTimeoutError", () => {
    it("should extend ContextHydrationError and TemplarError", () => {
      const error = new HydrationTimeoutError(2000);
      expect(error).toBeInstanceOf(ContextHydrationError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new HydrationTimeoutError(2000);
      const entry = ERROR_CATALOG.CONTEXT_HYDRATION_TIMEOUT;
      expect(error.code).toBe("CONTEXT_HYDRATION_TIMEOUT");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new HydrationTimeoutError(2000);
      expect(error._tag).toBe("ContextHydrationError");
    });

    it("should store constructor args", () => {
      const error = new HydrationTimeoutError(3000);
      expect(error.timeoutMs).toBe(3000);
    });

    it("should have descriptive message", () => {
      const error = new HydrationTimeoutError(2000);
      expect(error.message).toBe("Context hydration exceeded global timeout of 2000ms");
    });

    it("should serialize to JSON", () => {
      const error = new HydrationTimeoutError(2000);
      const json = error.toJSON();
      expect(json.code).toBe("CONTEXT_HYDRATION_TIMEOUT");
      expect(json._tag).toBe("ContextHydrationError");
      expect(json.domain).toBe("context");
    });
  });

  describe("HydrationSourceFailedError", () => {
    it("should extend ContextHydrationError and TemplarError", () => {
      const error = new HydrationSourceFailedError("memory_query", "API down");
      expect(error).toBeInstanceOf(ContextHydrationError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new HydrationSourceFailedError("mcp_tool", "timeout");
      const entry = ERROR_CATALOG.CONTEXT_SOURCE_FAILED;
      expect(error.code).toBe("CONTEXT_SOURCE_FAILED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
    });

    it("should have correct _tag discriminant", () => {
      const error = new HydrationSourceFailedError("mcp_tool", "timeout");
      expect(error._tag).toBe("ContextHydrationError");
    });

    it("should store constructor args", () => {
      const error = new HydrationSourceFailedError("linked_resource", "404");
      expect(error.sourceType).toBe("linked_resource");
      expect(error.reason).toBe("404");
    });

    it("should have descriptive message", () => {
      const error = new HydrationSourceFailedError("memory_query", "API down");
      expect(error.message).toBe('Context source "memory_query" failed: API down');
    });
  });

  describe("instanceof chains", () => {
    it("all context hydration errors should be instanceof ContextHydrationError", () => {
      const errors = [
        new HydrationTimeoutError(2000),
        new HydrationSourceFailedError("mcp_tool", "fail"),
      ];
      for (const error of errors) {
        expect(error).toBeInstanceOf(ContextHydrationError);
      }
    });

    it("all context hydration errors should be instanceof TemplarError", () => {
      const errors = [
        new HydrationTimeoutError(2000),
        new HydrationSourceFailedError("mcp_tool", "fail"),
      ];
      for (const error of errors) {
        expect(error).toBeInstanceOf(TemplarError);
      }
    });

    it("all context hydration errors should have _tag = ContextHydrationError", () => {
      const errors = [
        new HydrationTimeoutError(2000),
        new HydrationSourceFailedError("mcp_tool", "fail"),
      ];
      for (const error of errors) {
        expect(error._tag).toBe("ContextHydrationError");
      }
    });
  });
});
