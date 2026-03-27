import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_SYNC_CONFIG,
  isValidTransition,
  VALID_TRANSITIONS,
} from "../../sync/constants.js";

describe("sync constants", () => {
  describe("VALID_TRANSITIONS", () => {
    it("defines transitions for all 6 states", () => {
      const states = Object.keys(VALID_TRANSITIONS);
      expect(states).toHaveLength(6);
      expect(states).toContain("DISCONNECTED");
      expect(states).toContain("RECONNECTING");
      expect(states).toContain("AUTH_REFRESH");
      expect(states).toContain("CONFLICT_SCAN");
      expect(states).toContain("WAL_REPLAY");
      expect(states).toContain("ONLINE");
    });

    it("DISCONNECTED can only go to RECONNECTING", () => {
      expect(VALID_TRANSITIONS.DISCONNECTED).toEqual(["RECONNECTING"]);
    });

    it("ONLINE can only go to DISCONNECTED", () => {
      expect(VALID_TRANSITIONS.ONLINE).toEqual(["DISCONNECTED"]);
    });

    it("every intermediate state can go to DISCONNECTED", () => {
      for (const state of [
        "RECONNECTING",
        "AUTH_REFRESH",
        "CONFLICT_SCAN",
        "WAL_REPLAY",
      ] as const) {
        expect(VALID_TRANSITIONS[state]).toContain("DISCONNECTED");
      }
    });
  });

  describe("isValidTransition", () => {
    it("returns true for valid transitions", () => {
      expect(isValidTransition("DISCONNECTED", "RECONNECTING")).toBe(true);
      expect(isValidTransition("RECONNECTING", "AUTH_REFRESH")).toBe(true);
      expect(isValidTransition("AUTH_REFRESH", "CONFLICT_SCAN")).toBe(true);
      expect(isValidTransition("CONFLICT_SCAN", "WAL_REPLAY")).toBe(true);
      expect(isValidTransition("WAL_REPLAY", "ONLINE")).toBe(true);
      expect(isValidTransition("ONLINE", "DISCONNECTED")).toBe(true);
    });

    it("returns false for invalid transitions", () => {
      expect(isValidTransition("DISCONNECTED", "ONLINE")).toBe(false);
      expect(isValidTransition("ONLINE", "RECONNECTING")).toBe(false);
      expect(isValidTransition("AUTH_REFRESH", "WAL_REPLAY")).toBe(false);
    });
  });

  describe("DEFAULT_EDGE_SYNC_CONFIG", () => {
    it("has all required fields as positive numbers", () => {
      for (const value of Object.values(DEFAULT_EDGE_SYNC_CONFIG)) {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      }
    });
  });
});
