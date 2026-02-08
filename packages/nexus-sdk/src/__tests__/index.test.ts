import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@nexus/sdk", () => {
  it("should export package name", () => {
    expect(PACKAGE_NAME).toBe("@nexus/sdk");
  });
});
