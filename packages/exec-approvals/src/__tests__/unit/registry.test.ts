import { describe, expect, it } from "vitest";
import { DEFAULT_SAFE_BINARIES } from "../../constants.js";
import { createRegistry, isSafeBinary } from "../../registry.js";

describe("createRegistry", () => {
  it("should create a registry with default binaries", () => {
    const registry = createRegistry([], []);
    expect(registry.size).toBe(DEFAULT_SAFE_BINARIES.length);
  });

  it("should include common safe binaries", () => {
    const registry = createRegistry([], []);
    expect(registry.has("ls")).toBe(true);
    expect(registry.has("cat")).toBe(true);
    expect(registry.has("git")).toBe(true);
    expect(registry.has("node")).toBe(true);
    expect(registry.has("grep")).toBe(true);
  });

  it("should add custom binaries", () => {
    const registry = createRegistry(["my-tool", "my-other-tool"], []);
    expect(registry.has("my-tool")).toBe(true);
    expect(registry.has("my-other-tool")).toBe(true);
    expect(registry.size).toBe(DEFAULT_SAFE_BINARIES.length + 2);
  });

  it("should remove specified binaries", () => {
    const registry = createRegistry([], ["ls", "cat"]);
    expect(registry.has("ls")).toBe(false);
    expect(registry.has("cat")).toBe(false);
    expect(registry.has("git")).toBe(true);
    expect(registry.size).toBe(DEFAULT_SAFE_BINARIES.length - 2);
  });

  it("should handle both additions and removals", () => {
    const registry = createRegistry(["my-tool"], ["ls"]);
    expect(registry.has("my-tool")).toBe(true);
    expect(registry.has("ls")).toBe(false);
  });

  it("should handle empty inputs", () => {
    const registry = createRegistry([], []);
    expect(registry.size).toBeGreaterThan(0);
  });

  it("should handle duplicate additions gracefully", () => {
    const registry = createRegistry(["ls", "ls"], []);
    // "ls" already in defaults, adding it twice shouldn't change count
    expect(registry.has("ls")).toBe(true);
    expect(registry.size).toBe(DEFAULT_SAFE_BINARIES.length);
  });
});

describe("isSafeBinary", () => {
  it("should return true for safe binaries", () => {
    const registry = createRegistry([], []);
    expect(isSafeBinary(registry, "ls")).toBe(true);
    expect(isSafeBinary(registry, "git")).toBe(true);
  });

  it("should return false for unknown binaries", () => {
    const registry = createRegistry([], []);
    expect(isSafeBinary(registry, "unknown-tool")).toBe(false);
    expect(isSafeBinary(registry, "rm")).toBe(false);
  });
});
