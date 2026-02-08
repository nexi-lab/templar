import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@templar/model-router", () => {
  it("should export package name", () => {
    expect(PACKAGE_NAME).toBe("@templar/model-router");
  });
});
