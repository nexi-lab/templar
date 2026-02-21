import { describe, expect, it } from "vitest";
import { detectConflict, type OperationState } from "../../conflict/index.js";

describe("detectConflict", () => {
  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function makeOp(
    clock: Record<string, number>,
    timestamp: number,
    origin: string,
  ): OperationState {
    return { clock, timestamp, origin };
  }

  // -----------------------------------------------------------------------
  // Causally ordered (no conflict)
  // -----------------------------------------------------------------------

  describe("causally ordered", () => {
    it("local BEFORE remote → NO_CONFLICT, remote wins", () => {
      const local = makeOp({ a: 1 }, 1000, "edge");
      const remote = makeOp({ a: 2 }, 2000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("NO_CONFLICT");
      expect(result.winner).toBe("cloud");
    });

    it("local AFTER remote → NO_CONFLICT, local wins", () => {
      const local = makeOp({ a: 3 }, 3000, "edge");
      const remote = makeOp({ a: 1 }, 1000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("NO_CONFLICT");
      expect(result.winner).toBe("edge");
    });

    it("EQUAL clocks → NO_CONFLICT, no winner", () => {
      const local = makeOp({ a: 2, b: 3 }, 1000, "edge");
      const remote = makeOp({ a: 2, b: 3 }, 1000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("NO_CONFLICT");
      expect(result.winner).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent (LWW resolution)
  // -----------------------------------------------------------------------

  describe("concurrent — LWW", () => {
    it("local has later timestamp → EDGE_WINS", () => {
      const local = makeOp({ a: 2, b: 1 }, 2000, "edge");
      const remote = makeOp({ a: 1, b: 2 }, 1000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("EDGE_WINS");
      expect(result.winner).toBe("edge");
    });

    it("remote has later timestamp → CLOUD_WINS", () => {
      const local = makeOp({ a: 2, b: 1 }, 1000, "edge");
      const remote = makeOp({ a: 1, b: 2 }, 2000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("CLOUD_WINS");
      expect(result.winner).toBe("cloud");
    });

    it("identical timestamps → TRUE_CONFLICT", () => {
      const local = makeOp({ a: 2, b: 1 }, 1000, "edge");
      const remote = makeOp({ a: 1, b: 2 }, 1000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("TRUE_CONFLICT");
      expect(result.winner).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Disjoint node sets (concurrent)
  // -----------------------------------------------------------------------

  describe("disjoint nodes", () => {
    it("completely disjoint → CONCURRENT, LWW resolves", () => {
      const local = makeOp({ a: 1 }, 3000, "edge");
      const remote = makeOp({ b: 1 }, 1000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("EDGE_WINS");
      expect(result.winner).toBe("edge");
    });
  });

  // -----------------------------------------------------------------------
  // Result structure
  // -----------------------------------------------------------------------

  describe("result structure", () => {
    it("always includes outcome, winner, and reason", () => {
      const local = makeOp({ a: 1 }, 1000, "edge");
      const remote = makeOp({ a: 2 }, 2000, "cloud");
      const result = detectConflict(local, remote);

      expect(result).toHaveProperty("outcome");
      expect(result).toHaveProperty("winner");
      expect(result).toHaveProperty("reason");
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("reason includes origin labels", () => {
      // Use causally ordered case where both origins appear in the reason
      const local = makeOp({ a: 1 }, 1000, "node-a");
      const remote = makeOp({ a: 2 }, 2000, "node-b");
      const result = detectConflict(local, remote);

      expect(result.reason).toContain("node-a");
      expect(result.reason).toContain("node-b");
    });
  });

  // -----------------------------------------------------------------------
  // Empty clocks
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("both empty clocks → EQUAL, NO_CONFLICT", () => {
      const local = makeOp({}, 1000, "edge");
      const remote = makeOp({}, 2000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("NO_CONFLICT");
      expect(result.winner).toBeNull();
    });

    it("one empty clock → causally ordered", () => {
      const local = makeOp({}, 1000, "edge");
      const remote = makeOp({ a: 1 }, 2000, "cloud");
      const result = detectConflict(local, remote);

      expect(result.outcome).toBe("NO_CONFLICT");
      expect(result.winner).toBe("cloud");
    });
  });
});
