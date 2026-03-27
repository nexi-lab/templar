import { describe, expect, it } from "vitest";
import {
  FederationConfigurationInvalidError,
  FederationConflictUnresolvedError,
  FederationError,
  FederationSyncAuthFailedError,
  FederationSyncDisconnectedError,
  FederationSyncInvalidTransitionError,
  FederationSyncTimeoutError,
  FederationZoneAlreadyExistsError,
  FederationZoneInvalidIdError,
  FederationZoneJoinFailedError,
  FederationZoneNotFoundError,
  FederationZoneShareFailedError,
  FederationZoneTerminatingError,
  TemplarError,
} from "../../index.js";

describe("FederationError hierarchy", () => {
  // -----------------------------------------------------------------------
  // Zone errors
  // -----------------------------------------------------------------------

  describe("FederationZoneNotFoundError", () => {
    it("carries zoneId and correct catalog values", () => {
      const error = new FederationZoneNotFoundError("my-zone");
      expect(error._tag).toBe("NotFoundError");
      expect(error.code).toBe("FEDERATION_ZONE_NOT_FOUND");
      expect(error.httpStatus).toBe(404);
      expect(error.grpcCode).toBe("NOT_FOUND");
      expect(error.domain).toBe("federation");
      expect(error.isExpected).toBe(true);
      expect(error.zoneId).toBe("my-zone");
    });

    it("instanceof chain", () => {
      const error = new FederationZoneNotFoundError("z");
      expect(error).toBeInstanceOf(FederationError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("FederationZoneAlreadyExistsError", () => {
    it("carries zoneId and correct catalog values", () => {
      const error = new FederationZoneAlreadyExistsError("dup-zone");
      expect(error._tag).toBe("ConflictError");
      expect(error.code).toBe("FEDERATION_ZONE_ALREADY_EXISTS");
      expect(error.httpStatus).toBe(409);
      expect(error.domain).toBe("federation");
      expect(error.isExpected).toBe(true);
      expect(error.zoneId).toBe("dup-zone");
    });
  });

  describe("FederationZoneInvalidIdError", () => {
    it("carries zoneId and message", () => {
      const error = new FederationZoneInvalidIdError("BAD", "too short");
      expect(error._tag).toBe("ValidationError");
      expect(error.code).toBe("FEDERATION_ZONE_INVALID_ID");
      expect(error.httpStatus).toBe(400);
      expect(error.domain).toBe("federation");
      expect(error.zoneId).toBe("BAD");
      expect(error.message).toContain("BAD");
      expect(error.message).toContain("too short");
    });
  });

  describe("FederationZoneTerminatingError", () => {
    it("carries zoneId and phase", () => {
      const error = new FederationZoneTerminatingError("my-zone", "Terminating");
      expect(error._tag).toBe("ConflictError");
      expect(error.code).toBe("FEDERATION_ZONE_TERMINATING");
      expect(error.httpStatus).toBe(409);
      expect(error.domain).toBe("federation");
      expect(error.zoneId).toBe("my-zone");
      expect(error.phase).toBe("Terminating");
      expect(error.message).toContain("Terminating");
    });
  });

  describe("FederationZoneShareFailedError", () => {
    it("carries zoneId and wraps cause", () => {
      const cause = new Error("network");
      const error = new FederationZoneShareFailedError("z1", "timeout", cause);
      expect(error._tag).toBe("ExternalError");
      expect(error.code).toBe("FEDERATION_ZONE_SHARE_FAILED");
      expect(error.httpStatus).toBe(502);
      expect(error.domain).toBe("federation");
      expect(error.zoneId).toBe("z1");
      expect(error.message).toContain("z1");
      expect(error.message).toContain("timeout");
    });

    it("works without cause", () => {
      const error = new FederationZoneShareFailedError("z2", "refused");
      expect(error.zoneId).toBe("z2");
    });
  });

  describe("FederationZoneJoinFailedError", () => {
    it("carries zoneId and wraps cause", () => {
      const cause = new Error("dns");
      const error = new FederationZoneJoinFailedError("z3", "dns error", cause);
      expect(error._tag).toBe("ExternalError");
      expect(error.code).toBe("FEDERATION_ZONE_JOIN_FAILED");
      expect(error.httpStatus).toBe(502);
      expect(error.domain).toBe("federation");
      expect(error.zoneId).toBe("z3");
    });
  });

  // -----------------------------------------------------------------------
  // Sync errors
  // -----------------------------------------------------------------------

  describe("FederationSyncDisconnectedError", () => {
    it("carries correct catalog values", () => {
      const error = new FederationSyncDisconnectedError("user disconnect");
      expect(error._tag).toBe("ExternalError");
      expect(error.code).toBe("FEDERATION_SYNC_DISCONNECTED");
      expect(error.httpStatus).toBe(503);
      expect(error.domain).toBe("federation");
      expect(error.isExpected).toBe(false);
      expect(error.message).toContain("user disconnect");
    });

    it("instanceof chain", () => {
      const error = new FederationSyncDisconnectedError("x");
      expect(error).toBeInstanceOf(FederationError);
      expect(error).toBeInstanceOf(TemplarError);
    });
  });

  describe("FederationSyncAuthFailedError", () => {
    it("carries correct catalog values", () => {
      const error = new FederationSyncAuthFailedError("token expired");
      expect(error._tag).toBe("PermissionError");
      expect(error.code).toBe("FEDERATION_SYNC_AUTH_FAILED");
      expect(error.httpStatus).toBe(401);
      expect(error.grpcCode).toBe("UNAUTHENTICATED");
      expect(error.domain).toBe("federation");
      expect(error.isExpected).toBe(true);
    });

    it("wraps cause when provided", () => {
      const cause = new Error("jwt malformed");
      const error = new FederationSyncAuthFailedError("bad token", cause);
      expect(error.message).toContain("bad token");
    });
  });

  describe("FederationSyncTimeoutError", () => {
    it("carries timeoutMs and phaseName", () => {
      const error = new FederationSyncTimeoutError(5000, "AUTH_REFRESH");
      expect(error._tag).toBe("TimeoutError");
      expect(error.code).toBe("FEDERATION_SYNC_TIMEOUT");
      expect(error.httpStatus).toBe(504);
      expect(error.domain).toBe("federation");
      expect(error.timeoutMs).toBe(5000);
      expect(error.phaseName).toBe("AUTH_REFRESH");
      expect(error.message).toContain("5000");
      expect(error.message).toContain("AUTH_REFRESH");
    });
  });

  describe("FederationSyncInvalidTransitionError", () => {
    it("carries from and to states", () => {
      const error = new FederationSyncInvalidTransitionError("ONLINE", "WAL_REPLAY");
      expect(error._tag).toBe("ValidationError");
      expect(error.code).toBe("FEDERATION_SYNC_INVALID_TRANSITION");
      expect(error.httpStatus).toBe(400);
      expect(error.domain).toBe("federation");
      expect(error.from).toBe("ONLINE");
      expect(error.to).toBe("WAL_REPLAY");
      expect(error.message).toContain("ONLINE");
      expect(error.message).toContain("WAL_REPLAY");
    });
  });

  // -----------------------------------------------------------------------
  // Conflict + config errors
  // -----------------------------------------------------------------------

  describe("FederationConflictUnresolvedError", () => {
    it("carries correct catalog values", () => {
      const error = new FederationConflictUnresolvedError("divergent clocks");
      expect(error._tag).toBe("ConflictError");
      expect(error.code).toBe("FEDERATION_CONFLICT_UNRESOLVED");
      expect(error.httpStatus).toBe(409);
      expect(error.domain).toBe("federation");
      expect(error.message).toContain("divergent clocks");
    });
  });

  describe("FederationConfigurationInvalidError", () => {
    it("carries correct catalog values", () => {
      const error = new FederationConfigurationInvalidError("maxReconnectAttempts must be > 0");
      expect(error._tag).toBe("ValidationError");
      expect(error.code).toBe("FEDERATION_CONFIGURATION_INVALID");
      expect(error.httpStatus).toBe(400);
      expect(error.domain).toBe("federation");
      expect(error.isExpected).toBe(true);
      expect(error.message).toContain("maxReconnectAttempts");
    });

    it("instanceof chain", () => {
      const error = new FederationConfigurationInvalidError("x");
      expect(error).toBeInstanceOf(FederationError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
