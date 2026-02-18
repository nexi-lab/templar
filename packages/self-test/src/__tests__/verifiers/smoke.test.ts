import { afterEach, describe, expect, it, vi } from "vitest";
import { SmokeVerifier } from "../../verifiers/smoke.js";
import { makeVerifierContext } from "../helpers.js";

describe("SmokeVerifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass navigate step with 200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const verifier = new SmokeVerifier({
      steps: [{ action: "navigate", url: "http://localhost:3000" }],
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.phase).toBe("smoke");
    expect(result.verifierName).toBe("smoke");
    expect(result.assertions[0]?.passed).toBe(true);
  });

  it("should pass navigate with 3xx redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 301 }));

    const verifier = new SmokeVerifier({
      steps: [{ action: "navigate", url: "http://localhost:3000" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
  });

  it("should fail navigate with 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));

    const verifier = new SmokeVerifier({
      steps: [{ action: "navigate", url: "http://localhost:3000" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
  });

  it("should pass assertStatus when status matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const verifier = new SmokeVerifier({
      steps: [{ action: "assertStatus", url: "http://localhost:3000/health", expectedStatus: 200 }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
    expect(result.assertions[0]?.expected).toBe(200);
    expect(result.assertions[0]?.actual).toBe(200);
  });

  it("should fail assertStatus when status mismatches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 503 }));

    const verifier = new SmokeVerifier({
      steps: [{ action: "assertStatus", url: "http://localhost:3000/health", expectedStatus: 200 }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("Expected 200, got 503");
  });

  it("should pass assertText when text is found in body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"status":"ok","message":"Server is running"}', { status: 200 }),
    );

    const verifier = new SmokeVerifier({
      steps: [{ action: "assertText", url: "http://localhost:3000/health", text: "ok" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
  });

  it("should fail assertText when text is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"status":"error"}', { status: 200 }),
    );

    const verifier = new SmokeVerifier({
      steps: [{ action: "assertText", url: "http://localhost:3000/health", text: "success" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("not found");
  });

  it("should skip waitFor gracefully (no browser)", async () => {
    const verifier = new SmokeVerifier({
      steps: [{ action: "waitFor", selector: ".loaded" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
    expect(result.assertions[0]?.message).toContain("skipped");
  });

  it("should fail navigate without url", async () => {
    const verifier = new SmokeVerifier({
      steps: [{ action: "navigate" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires url");
  });

  it("should fail assertStatus without url", async () => {
    const verifier = new SmokeVerifier({
      steps: [{ action: "assertStatus", expectedStatus: 200 }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires url");
  });

  it("should fail assertText without url or text", async () => {
    const verifier = new SmokeVerifier({
      steps: [{ action: "assertText" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("requires url and text");
  });

  it("should handle network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const verifier = new SmokeVerifier({
      steps: [{ action: "navigate", url: "http://localhost:3000" }],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.message).toContain("ECONNREFUSED");
  });

  it("should support custom name", () => {
    const verifier = new SmokeVerifier(
      { steps: [{ action: "navigate", url: "http://localhost:3000" }] },
      "custom-smoke",
    );
    expect(verifier.name).toBe("custom-smoke");
  });

  it("should run multiple steps sequentially", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const verifier = new SmokeVerifier({
      steps: [
        { action: "navigate", url: "http://localhost:3000" },
        { action: "assertStatus", url: "http://localhost:3000/health", expectedStatus: 200 },
        { action: "waitFor", selector: ".loaded" },
      ],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
    expect(result.assertions).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // navigate + assertStatus, waitFor skips fetch
  });
});
