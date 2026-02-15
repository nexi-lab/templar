import { describe, expect, it } from "vitest";
import { generateNearbyPositions } from "../../operations.js";

describe("generateNearbyPositions", () => {
  it("returns exact position first", () => {
    const positions = generateNearbyPositions(10, 5, {
      lines: 1,
      characters: 1,
    });
    expect(positions[0]).toEqual({ line: 10, character: 5 });
  });

  it("generates nearby positions within tolerance", () => {
    const positions = generateNearbyPositions(10, 5, {
      lines: 1,
      characters: 1,
    });
    // Should have exact + 8 nearby (3x3 - 1 for exact)
    expect(positions.length).toBe(9);
    // All positions should be within tolerance
    for (const pos of positions) {
      expect(Math.abs(pos.line - 10)).toBeLessThanOrEqual(1);
      expect(Math.abs(pos.character - 5)).toBeLessThanOrEqual(1);
    }
  });

  it("filters out negative positions", () => {
    const positions = generateNearbyPositions(0, 0, {
      lines: 1,
      characters: 1,
    });
    for (const pos of positions) {
      expect(pos.line).toBeGreaterThanOrEqual(0);
      expect(pos.character).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles zero tolerance (exact only)", () => {
    const positions = generateNearbyPositions(5, 3, {
      lines: 0,
      characters: 0,
    });
    expect(positions).toEqual([{ line: 5, character: 3 }]);
  });

  it("handles large tolerance", () => {
    const positions = generateNearbyPositions(5, 5, {
      lines: 2,
      characters: 3,
    });
    // (2*2+1) * (2*3+1) = 5 * 7 = 35 total
    expect(positions.length).toBe(35);
    expect(positions[0]).toEqual({ line: 5, character: 5 });
  });

  it("handles position at line 0 with line tolerance", () => {
    const positions = generateNearbyPositions(0, 5, {
      lines: 2,
      characters: 0,
    });
    // Exact + line -1 (filtered) + line -2 (filtered) + line 1 + line 2
    // Only lines >= 0 are kept
    const lines = positions.map((p) => p.line);
    expect(lines.every((l) => l >= 0)).toBe(true);
    expect(lines).toContain(0);
    expect(lines).toContain(1);
    expect(lines).toContain(2);
    expect(lines).not.toContain(-1);
  });
});
