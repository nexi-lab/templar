import type { TemplarMiddleware } from "@templar/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAutoMiddlewares,
  registerAutoMiddleware,
  unregisterAutoMiddlewares,
} from "../middleware-wrapper.js";

describe("auto-middleware registry", () => {
  afterEach(() => {
    unregisterAutoMiddlewares();
  });

  it("should start with an empty list", () => {
    expect(getAutoMiddlewares()).toEqual([]);
  });

  it("should register a single auto-middleware", () => {
    const mw: TemplarMiddleware = { name: "test-mw" };
    registerAutoMiddleware(mw);

    const result = getAutoMiddlewares();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("test-mw");
  });

  it("should register multiple auto-middlewares in order", () => {
    const mw1: TemplarMiddleware = { name: "first" };
    const mw2: TemplarMiddleware = { name: "second" };
    registerAutoMiddleware(mw1);
    registerAutoMiddleware(mw2);

    const result = getAutoMiddlewares();
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("first");
    expect(result[1]?.name).toBe("second");
  });

  it("should clear all auto-middlewares on unregister", () => {
    registerAutoMiddleware({ name: "a" });
    registerAutoMiddleware({ name: "b" });
    expect(getAutoMiddlewares()).toHaveLength(2);

    unregisterAutoMiddlewares();
    expect(getAutoMiddlewares()).toEqual([]);
  });

  it("should return an immutable array (new reference each time)", () => {
    registerAutoMiddleware({ name: "test" });
    const ref1 = getAutoMiddlewares();
    const ref2 = getAutoMiddlewares();

    // Same contents but the array is a frozen readonly reference
    expect(ref1).toEqual(ref2);
  });

  it("should allow re-registration after unregister", () => {
    registerAutoMiddleware({ name: "original" });
    unregisterAutoMiddlewares();
    registerAutoMiddleware({ name: "new" });

    const result = getAutoMiddlewares();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("new");
  });

  it("should deduplicate by name", () => {
    registerAutoMiddleware({ name: "cache-trace" });
    registerAutoMiddleware({ name: "cache-trace" });

    const result = getAutoMiddlewares();
    expect(result).toHaveLength(1);
  });
});
