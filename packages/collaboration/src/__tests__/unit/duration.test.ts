import { describe, expect, it } from "vitest";
import { parseDuration } from "../../shared/duration.js";

describe("parseDuration", () => {
  it("should parse seconds", () => {
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration("1s")).toBe(1_000);
    expect(parseDuration("30s")).toBe(30_000);
  });

  it("should parse minutes", () => {
    expect(parseDuration("1m")).toBe(60_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("30m")).toBe(1_800_000);
  });

  it("should parse hours", () => {
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("24h")).toBe(86_400_000);
  });

  it("should parse days", () => {
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(parseDuration("7d")).toBe(604_800_000);
  });

  it("should parse fractional values", () => {
    expect(parseDuration("0.5h")).toBe(1_800_000);
    expect(parseDuration("1.5m")).toBe(90_000);
  });

  it("should trim whitespace", () => {
    expect(parseDuration(" 10m ")).toBe(600_000);
  });

  it("should throw on invalid format", () => {
    expect(() => parseDuration("")).toThrow("Invalid duration format");
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
    expect(() => parseDuration("10")).toThrow("Invalid duration format");
    expect(() => parseDuration("10x")).toThrow("Invalid duration format");
    expect(() => parseDuration("-5m")).toThrow("Invalid duration format");
  });
});
