import { FederationZoneInvalidIdError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { validateZoneId } from "../../zone/validation.js";

describe("validateZoneId", () => {
  describe("valid IDs", () => {
    it.each([
      "abc",
      "zone-1",
      "my-test-zone",
      "a0b",
      "a".repeat(63),
      "000",
      "zone-with-multiple-hyphens-in-between",
    ])("accepts '%s'", (id) => {
      expect(() => validateZoneId(id)).not.toThrow();
    });
  });

  describe("invalid IDs", () => {
    it("rejects empty string", () => {
      expect(() => validateZoneId("")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects too short (1 char)", () => {
      expect(() => validateZoneId("a")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects too short (2 chars)", () => {
      expect(() => validateZoneId("ab")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects too long (64 chars)", () => {
      expect(() => validateZoneId("a".repeat(64))).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects leading hyphen", () => {
      expect(() => validateZoneId("-abc")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects trailing hyphen", () => {
      expect(() => validateZoneId("abc-")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects uppercase", () => {
      expect(() => validateZoneId("ABC")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects spaces", () => {
      expect(() => validateZoneId("my zone")).toThrow(FederationZoneInvalidIdError);
    });

    it("rejects special characters", () => {
      expect(() => validateZoneId("zone_1")).toThrow(FederationZoneInvalidIdError);
    });

    it("error includes the invalid ID", () => {
      try {
        validateZoneId("BAD");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FederationZoneInvalidIdError);
        expect((error as FederationZoneInvalidIdError).zoneId).toBe("BAD");
      }
    });
  });
});
