import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@templar/errors", () => {
  it("should export package name", () => {
    expect(PACKAGE_NAME).toBe("@templar/errors");
  });
});
