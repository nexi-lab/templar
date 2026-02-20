import { describe, expect, it } from "vitest";
import {
  extractPairingCode,
  generatePairingCode,
  normalizePairingCode,
} from "../code-generator.js";

const ALLOWED_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));

describe("generatePairingCode", () => {
  it("generates code of correct length", () => {
    const result = generatePairingCode(8);
    expect(result.code).toHaveLength(8);
  });

  it("uses only allowed characters (no 0O1I)", () => {
    // Generate many codes to increase confidence
    for (let i = 0; i < 100; i++) {
      const { code } = generatePairingCode(8);
      for (const char of code) {
        expect(ALLOWED_CHARS.has(char)).toBe(true);
      }
    }
  });

  it("returns formatted version with dash at midpoint", () => {
    const { code, formatted } = generatePairingCode(8);
    expect(formatted).toBe(`${code.slice(0, 4)}-${code.slice(4)}`);
    expect(formatted).toHaveLength(9); // 8 chars + 1 dash
  });

  it("two consecutive codes are different", () => {
    const a = generatePairingCode(8);
    const b = generatePairingCode(8);
    expect(a.code).not.toBe(b.code);
  });

  it("supports custom code length", () => {
    const { code, formatted } = generatePairingCode(6);
    expect(code).toHaveLength(6);
    // Dash at midpoint: 3-3
    expect(formatted).toBe(`${code.slice(0, 3)}-${code.slice(3)}`);
  });
});

describe("normalizePairingCode", () => {
  it("strips dashes and uppercases", () => {
    expect(normalizePairingCode("a3k9-x2m7")).toBe("A3K9X2M7");
  });

  it("trims whitespace", () => {
    expect(normalizePairingCode("  A3K9-X2M7  ")).toBe("A3K9X2M7");
  });

  it("handles already-normalized code", () => {
    expect(normalizePairingCode("A3K9X2M7")).toBe("A3K9X2M7");
  });
});

describe("extractPairingCode", () => {
  it("finds code in mixed text", () => {
    expect(extractPairingCode("Hi there A3K9-X2M7 please pair me")).toBe("A3K9X2M7");
  });

  it("returns undefined for text without code", () => {
    expect(extractPairingCode("Hello, how are you?")).toBeUndefined();
  });

  it("extracts code without dash", () => {
    expect(extractPairingCode("my code is A3K9X2M7")).toBe("A3K9X2M7");
  });

  it("extracts code with dash", () => {
    expect(extractPairingCode("code: A3K9-X2M7")).toBe("A3K9X2M7");
  });
});
