import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@templar/test-utils", () => {
  it("should export package name", () => {
    expect(PACKAGE_NAME).toBe("@templar/test-utils");
  });
});
