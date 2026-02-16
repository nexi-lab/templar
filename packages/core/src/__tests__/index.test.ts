import { describe, expect, it } from "vitest";
import type { TemplarConfig, TemplarMiddleware } from "../index.js";

describe("@templar/core (types-only kernel)", () => {
  it("should export TemplarConfig type", () => {
    const config: TemplarConfig = { model: "gpt-4" };
    expect(config).toBeDefined();
  });

  it("should export TemplarMiddleware type", () => {
    const mw: TemplarMiddleware = { name: "test" };
    expect(mw).toBeDefined();
  });
});
