import { describe, expect, it } from "vitest";
import { fnv1a32 } from "../fnv-hash.js";

describe("fnv1a32", () => {
  it("should return a number", () => {
    expect(typeof fnv1a32("hello")).toBe("number");
  });

  it("should return unsigned 32-bit values", () => {
    const hash = fnv1a32("test");
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("should produce consistent results for the same input", () => {
    const a = fnv1a32("hello world");
    const b = fnv1a32("hello world");
    expect(a).toBe(b);
  });

  it("should produce different results for different inputs", () => {
    const a = fnv1a32("hello");
    const b = fnv1a32("world");
    expect(a).not.toBe(b);
  });

  it("should handle empty string", () => {
    const hash = fnv1a32("");
    expect(typeof hash).toBe("number");
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("should handle long strings", () => {
    const long = "a".repeat(10_000);
    const hash = fnv1a32(long);
    expect(typeof hash).toBe("number");
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("should handle unicode characters", () => {
    const hash = fnv1a32("hello 🌍");
    expect(typeof hash).toBe("number");
  });

  it("should differentiate near-identical strings", () => {
    const a = fnv1a32("abc");
    const b = fnv1a32("abd");
    expect(a).not.toBe(b);
  });
});
