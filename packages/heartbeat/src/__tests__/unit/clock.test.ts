import { describe, expect, it } from "vitest";
import { defaultClock } from "../../clock.js";

describe("defaultClock", () => {
  it("should return current time from now()", () => {
    const before = Date.now();
    const result = defaultClock.now();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it("should delegate setTimeout to globalThis", () => {
    return new Promise<void>((resolve) => {
      const id = defaultClock.setTimeout(() => {
        resolve();
      }, 10);
      expect(id).toBeDefined();
    });
  });

  it("should delegate clearTimeout to globalThis", () => {
    let called = false;
    const id = defaultClock.setTimeout(() => {
      called = true;
    }, 10);
    defaultClock.clearTimeout(id);

    return new Promise<void>((resolve) => {
      globalThis.setTimeout(() => {
        expect(called).toBe(false);
        resolve();
      }, 50);
    });
  });
});
