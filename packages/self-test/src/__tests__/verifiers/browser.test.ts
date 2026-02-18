import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserVerifier } from "../../verifiers/browser.js";
import { makeVerifierContext } from "../helpers.js";

// Mock playwright module
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  textContent: vi.fn().mockResolvedValue("Hello World"),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockContext = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

describe("BrowserVerifier", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should execute navigate step", async () => {
    const verifier = new BrowserVerifier([{ action: "navigate", url: "http://localhost:3000" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.phase).toBe("verification");
    expect(result.verifierName).toBe("browser");
    expect(mockPage.goto).toHaveBeenCalledWith("http://localhost:3000");
  });

  it("should execute fill step", async () => {
    const verifier = new BrowserVerifier([
      { action: "navigate", url: "http://localhost:3000" },
      { action: "fill", selector: "#username", value: "test" },
    ]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(mockPage.fill).toHaveBeenCalledWith("#username", "test");
  });

  it("should execute click step", async () => {
    const verifier = new BrowserVerifier([{ action: "click", selector: "#submit" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(mockPage.click).toHaveBeenCalledWith("#submit");
  });

  it("should execute waitFor step", async () => {
    const verifier = new BrowserVerifier([{ action: "waitFor", selector: ".loaded" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(mockPage.waitForSelector).toHaveBeenCalledWith(".loaded", { timeout: 10_000 });
  });

  it("should pass assertText when text is found", async () => {
    mockPage.textContent.mockResolvedValueOnce("Hello World from our app");

    const verifier = new BrowserVerifier([
      { action: "assertText", selector: "body", text: "Hello World" },
    ]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.assertions[0]?.passed).toBe(true);
  });

  it("should fail assertText when text is not found", async () => {
    mockPage.textContent.mockResolvedValueOnce("Goodbye");

    const verifier = new BrowserVerifier([
      { action: "assertText", selector: "body", text: "Hello" },
    ]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
    expect(result.assertions[0]?.message).toContain("not found");
  });

  it("should capture screenshot on failure when configured", async () => {
    mockPage.textContent.mockResolvedValueOnce("Wrong text");

    const verifier = new BrowserVerifier(
      [{ action: "assertText", selector: "body", text: "Expected" }],
      { screenshotOnFailure: true },
    );

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.screenshots).toHaveLength(1);
    expect(result.screenshots[0]?.name).toBe("failure-0");
  });

  it("should not capture screenshot on failure when disabled", async () => {
    mockPage.textContent.mockResolvedValueOnce("Wrong text");

    const verifier = new BrowserVerifier(
      [{ action: "assertText", selector: "body", text: "Expected" }],
      { screenshotOnFailure: false },
    );

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.screenshots).toHaveLength(0);
  });

  it("should capture explicit screenshot step", async () => {
    const verifier = new BrowserVerifier([
      { action: "navigate", url: "http://localhost:3000" },
      { action: "screenshot", screenshotName: "home-page" },
    ]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.screenshots).toHaveLength(1);
    expect(result.screenshots[0]?.name).toBe("home-page");
  });

  it("should fail navigate without url", async () => {
    const verifier = new BrowserVerifier([{ action: "navigate" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires url");
  });

  it("should fail fill without selector", async () => {
    const verifier = new BrowserVerifier([{ action: "fill", value: "test" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires selector and value");
  });

  it("should fail click without selector", async () => {
    const verifier = new BrowserVerifier([{ action: "click" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires selector");
  });

  it("should use custom viewport", async () => {
    const verifier = new BrowserVerifier([{ action: "navigate", url: "http://localhost:3000" }], {
      viewport: { width: 1920, height: 1080 },
    });

    await verifier.run(makeVerifierContext());

    expect(mockBrowser.newContext).toHaveBeenCalledWith({
      viewport: { width: 1920, height: 1080 },
    });
  });

  it("should support custom name", () => {
    const verifier = new BrowserVerifier([], {}, "custom-browser");
    expect(verifier.name).toBe("custom-browser");
    expect(verifier.phase).toBe("verification");
  });

  it("should close browser even on error", async () => {
    mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));

    const verifier = new BrowserVerifier([{ action: "navigate", url: "http://localhost:3000" }]);

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(mockPage.close).toHaveBeenCalled();
    expect(mockContext.close).toHaveBeenCalled();
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});

describe("BrowserVerifier — playwright not installed", () => {
  it("should throw SelfTestConfigurationInvalidError when playwright is missing", async () => {
    // Reset the mock to simulate playwright not being available
    vi.doUnmock("playwright");
    vi.resetModules();

    // Re-import with a fresh mock that rejects
    vi.doMock("playwright", () => {
      throw new Error("Cannot find module 'playwright'");
    });

    const { BrowserVerifier: FreshBrowserVerifier } = await import("../../verifiers/browser.js");

    const verifier = new FreshBrowserVerifier([
      { action: "navigate", url: "http://localhost:3000" },
    ]);

    // Use name check since module re-import may create different class identity
    await expect(verifier.run(makeVerifierContext())).rejects.toThrow(
      "playwright is not installed",
    );
  });
});
