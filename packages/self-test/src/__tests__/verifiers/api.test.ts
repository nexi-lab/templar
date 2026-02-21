import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiVerifier } from "../../verifiers/api.js";
import { makeVerifierContext } from "../helpers.js";

describe("ApiVerifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass when all steps match expected status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [
        { method: "GET", path: "/api/health", expectedStatus: 200 },
        { method: "GET", path: "/api/data", expectedStatus: 200 },
      ],
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.phase).toBe("verification");
    expect(result.verifierName).toBe("api");
    expect(result.assertions).toHaveLength(2);
    expect(result.assertions.every((a) => a.passed)).toBe(true);
  });

  it("should fail when status does not match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [{ method: "GET", path: "/api/health", expectedStatus: 200 }],
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
    expect(result.assertions[0]?.expected).toBe(200);
    expect(result.assertions[0]?.actual).toBe(500);
  });

  it("should fail when response body does not match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "error" }), { status: 200 }),
    );

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [
        {
          method: "GET",
          path: "/api/data",
          expectedStatus: 200,
          expectedBody: { status: "ok" },
        },
      ],
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
    expect(result.assertions[0]?.message).toContain("body mismatch");
  });

  it("should pass when body matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [
        {
          method: "GET",
          path: "/api/data",
          expectedStatus: 200,
          expectedBody: { status: "ok" },
        },
      ],
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
  });

  it("should send POST body and headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [
        {
          method: "POST",
          path: "/api/items",
          body: { name: "test" },
          headers: { Authorization: "Bearer token" },
          expectedStatus: 201,
        },
      ],
    });

    await verifier.run(makeVerifierContext());

    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs?.[0]).toBe("http://localhost:3000/api/items");
    const opts = callArgs?.[1] as RequestInit;
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ name: "test" }));
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("should handle network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [{ method: "GET", path: "/api/health" }],
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
    expect(result.assertions[0]?.message).toContain("ECONNREFUSED");
  });

  it("should support custom name", () => {
    const verifier = new ApiVerifier({ baseUrl: "http://localhost:3000", steps: [] }, "custom-api");
    expect(verifier.name).toBe("custom-api");
  });

  it("should pass without expectedStatus check", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [{ method: "GET", path: "/api/health" }], // No expectedStatus
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed"); // No assertion to fail
  });

  it("should handle abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));

    const verifier = new ApiVerifier({
      baseUrl: "http://localhost:3000",
      steps: [{ method: "GET", path: "/api/health", expectedStatus: 200 }],
    });

    const result = await verifier.run(makeVerifierContext({ abortSignal: controller.signal }));
    // With aborted signal, steps should be marked as aborted
    expect(result.assertions[0]?.passed).toBe(false);
  });
});
