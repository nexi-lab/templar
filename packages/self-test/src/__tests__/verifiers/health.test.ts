import { SelfTestTimeoutError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthVerifier } from "../../verifiers/health.js";
import { makeVerifierContext } from "../helpers.js";

describe("HealthVerifier", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should pass when all checks return expected status", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const verifier = new HealthVerifier({
      checks: [
        { name: "api", url: "http://localhost:3000/health" },
        { name: "db", url: "http://localhost:3000/db-health" },
      ],
      timeoutMs: 5_000,
    });

    const result = await verifier.run(makeVerifierContext());

    expect(result.status).toBe("passed");
    expect(result.phase).toBe("preflight");
    expect(result.verifierName).toBe("health");
    expect(result.assertions).toHaveLength(2);
    expect(result.assertions[0]?.passed).toBe(true);
    expect(result.assertions[1]?.passed).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should pass with custom expected status", async () => {
    // Use status 201 since 204 may not be valid in all Response implementations
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 201 }));

    const verifier = new HealthVerifier({
      checks: [{ name: "api", url: "http://localhost:3000/health", expectedStatus: 201 }],
      timeoutMs: 5_000,
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
    expect(result.assertions[0]?.passed).toBe(true);
  });

  it("should throw SelfTestTimeoutError on persistent status mismatch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 503 }));

    const verifier = new HealthVerifier({
      checks: [{ name: "api", url: "http://localhost:3000/health" }],
      timeoutMs: 500,
    });

    await expect(verifier.run(makeVerifierContext())).rejects.toThrow(SelfTestTimeoutError);
  });

  it("should throw on persistent network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const verifier = new HealthVerifier({
      checks: [{ name: "api", url: "http://localhost:3000/health" }],
      timeoutMs: 500,
    });

    // With persistent errors and short timeout, throws either timeout or health check error
    await expect(verifier.run(makeVerifierContext())).rejects.toThrow();
  });

  it("should retry with backoff on initial failure then succeed", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("ECONNREFUSED");
      }
      return new Response("ok", { status: 200 });
    });

    const verifier = new HealthVerifier({
      checks: [{ name: "api", url: "http://localhost:3000/health" }],
      timeoutMs: 10_000,
    });

    const result = await verifier.run(makeVerifierContext());
    expect(result.status).toBe("passed");
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it("should use custom name", () => {
    const verifier = new HealthVerifier(
      { checks: [{ name: "api", url: "http://localhost:3000" }] },
      "custom-health",
    );
    expect(verifier.name).toBe("custom-health");
    expect(verifier.phase).toBe("preflight");
  });

  it("should handle pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const verifier = new HealthVerifier({
      checks: [{ name: "api", url: "http://localhost:3000/health" }],
      timeoutMs: 5_000,
    });

    // With pre-aborted signal, the check should fail immediately
    const result = await verifier.run(makeVerifierContext({ abortSignal: controller.signal }));
    expect(result.status).toBe("failed");
    expect(result.assertions[0]?.passed).toBe(false);
    expect(result.assertions[0]?.message).toBe("Aborted");
  });
});
