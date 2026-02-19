import { describe, expect, it } from "vitest";
import {
  DelegationError,
  DelegationExhaustedError,
  DelegationInvalidError,
  DelegationNodeUnavailableError,
  DelegationTimeoutError,
  TemplarError,
} from "../../index.js";

describe("DelegationError hierarchy", () => {
  describe("DelegationNodeUnavailableError", () => {
    it("should carry nodeId and circuitOpen", () => {
      const error = new DelegationNodeUnavailableError("node-1", true);
      expect(error.nodeId).toBe("node-1");
      expect(error.circuitOpen).toBe(true);
    });

    it("should have correct error code", () => {
      const error = new DelegationNodeUnavailableError("node-1", false);
      expect(error.code).toBe("GATEWAY_DELEGATION_NODE_UNAVAILABLE");
    });

    it("should have HTTP status 502", () => {
      const error = new DelegationNodeUnavailableError("node-1", false);
      expect(error.httpStatus).toBe(502);
    });

    it("should mention circuit breaker in message when open", () => {
      const error = new DelegationNodeUnavailableError("node-1", true);
      expect(error.message).toContain("circuit breaker open");
    });

    it("should be instanceof DelegationError and TemplarError", () => {
      const error = new DelegationNodeUnavailableError("node-1", false);
      expect(error).toBeInstanceOf(DelegationError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("DelegationTimeoutError", () => {
    it("should carry delegationId, elapsedMs, and timeoutMs", () => {
      const error = new DelegationTimeoutError("del-1", 5000, 3000);
      expect(error.delegationId).toBe("del-1");
      expect(error.elapsedMs).toBe(5000);
      expect(error.timeoutMs).toBe(3000);
    });

    it("should have correct error code", () => {
      const error = new DelegationTimeoutError("del-1", 5000, 3000);
      expect(error.code).toBe("GATEWAY_DELEGATION_TIMEOUT");
    });

    it("should have HTTP status 504", () => {
      const error = new DelegationTimeoutError("del-1", 5000, 3000);
      expect(error.httpStatus).toBe(504);
    });

    it("should include times in message", () => {
      const error = new DelegationTimeoutError("del-1", 5000, 3000);
      expect(error.message).toContain("5000");
      expect(error.message).toContain("3000");
    });
  });

  describe("DelegationExhaustedError", () => {
    it("should carry delegationId and failedNodes", () => {
      const error = new DelegationExhaustedError("del-2", ["node-a", "node-b"]);
      expect(error.delegationId).toBe("del-2");
      expect(error.failedNodes).toEqual(["node-a", "node-b"]);
    });

    it("should have correct error code", () => {
      const error = new DelegationExhaustedError("del-2", ["node-a"]);
      expect(error.code).toBe("GATEWAY_DELEGATION_EXHAUSTED");
    });

    it("should have HTTP status 503", () => {
      const error = new DelegationExhaustedError("del-2", ["node-a"]);
      expect(error.httpStatus).toBe(503);
    });

    it("should list failed nodes in message", () => {
      const error = new DelegationExhaustedError("del-2", ["node-a", "node-b"]);
      expect(error.message).toContain("node-a");
      expect(error.message).toContain("node-b");
    });
  });

  describe("DelegationInvalidError", () => {
    it("should carry delegationId and reason", () => {
      const error = new DelegationInvalidError("del-3", "max active exceeded");
      expect(error.delegationId).toBe("del-3");
      expect(error.reason).toBe("max active exceeded");
    });

    it("should have correct error code", () => {
      const error = new DelegationInvalidError("del-3", "bad request");
      expect(error.code).toBe("GATEWAY_DELEGATION_INVALID");
    });

    it("should have HTTP status 400", () => {
      const error = new DelegationInvalidError("del-3", "bad request");
      expect(error.httpStatus).toBe(400);
    });

    it("should include reason in message", () => {
      const error = new DelegationInvalidError("del-3", "max active exceeded");
      expect(error.message).toContain("max active exceeded");
    });
  });

  describe("generic DelegationError catch", () => {
    it("should catch all delegation errors with instanceof DelegationError", () => {
      const errors: DelegationError[] = [
        new DelegationNodeUnavailableError("node-1", false),
        new DelegationTimeoutError("del-1", 5000, 3000),
        new DelegationExhaustedError("del-2", ["node-a"]),
        new DelegationInvalidError("del-3", "bad"),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(DelegationError);
        expect(error).toBeInstanceOf(TemplarError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should distinguish between specific error types", () => {
      const error: DelegationError = new DelegationNodeUnavailableError("n", false);

      expect(error).toBeInstanceOf(DelegationNodeUnavailableError);
      expect(error).not.toBeInstanceOf(DelegationTimeoutError);
      expect(error).not.toBeInstanceOf(DelegationExhaustedError);
      expect(error).not.toBeInstanceOf(DelegationInvalidError);
    });
  });
});
