import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDependenciesAvailable,
  checkPlatformDependencies,
  detectPlatform,
} from "../platform.js";

describe("detectPlatform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'macos' on darwin", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    expect(detectPlatform()).toBe("macos");
  });

  it("returns 'linux' on linux", () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    expect(detectPlatform()).toBe("linux");
  });

  it("throws SANDBOX_PLATFORM_UNSUPPORTED on win32", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(() => detectPlatform()).toThrow("not supported");
  });

  it("throws SANDBOX_PLATFORM_UNSUPPORTED on freebsd", () => {
    vi.stubGlobal("process", { ...process, platform: "freebsd" });
    expect(() => detectPlatform()).toThrow("not supported");
  });
});

describe("checkPlatformDependencies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports available on darwin", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const report = checkPlatformDependencies();
    expect(report.available).toBe(true);
    expect(report.platform).toBe("macos");
    expect(report.details).toContain("Seatbelt");
  });

  it("reports available on linux", () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const report = checkPlatformDependencies();
    expect(report.available).toBe(true);
    expect(report.platform).toBe("linux");
    expect(report.details).toContain("bubblewrap");
  });

  it("reports unavailable on unsupported platform", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const report = checkPlatformDependencies();
    expect(report.available).toBe(false);
    expect(report.platform).toBe("unsupported");
  });
});

describe("assertDependenciesAvailable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw on supported platform", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    expect(() => assertDependenciesAvailable()).not.toThrow();
  });

  it("throws on unsupported platform", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(() => assertDependenciesAvailable()).toThrow("not supported");
  });
});
