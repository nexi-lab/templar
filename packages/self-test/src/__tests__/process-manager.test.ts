import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessManager } from "../process-manager.js";

describe("ProcessManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should reuse existing server when reuseExisting is true", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const manager = new ProcessManager();
    await manager.start({
      command: "echo hello",
      url: "http://localhost:3000",
      reuseExisting: true,
    });

    // Should have checked once and returned
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await manager.stop();
  });

  it("should not reuse when reuseExisting is false", async () => {
    // First call (status check for reuseExisting) should not happen
    // Second+ calls are health polls
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        throw new Error("ECONNREFUSED");
      }
      return new Response("ok", { status: 200 });
    });

    const manager = new ProcessManager();

    // This will attempt to spawn and poll
    // Use a very short timeout to avoid waiting
    await expect(
      manager.start({
        command: "echo hello",
        url: "http://localhost:3000",
        reuseExisting: false,
        timeoutMs: 5_000,
      }),
    ).resolves.toBeUndefined();

    await manager.stop();
  });

  it("should fail if server does not become healthy within timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      // For the reuse check
      const signal = (opts as RequestInit | undefined)?.signal;
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      throw new Error("ECONNREFUSED");
    });

    const manager = new ProcessManager();

    await expect(
      manager.start({
        command: "sleep 60",
        url: "http://localhost:3000",
        reuseExisting: false,
        timeoutMs: 500,
      }),
    ).rejects.toThrow("failed to become healthy");

    await manager.stop();
  });

  it("should stop all tracked processes", async () => {
    const manager = new ProcessManager();
    // No processes to stop — should not throw
    await expect(manager.stop()).resolves.toBeUndefined();
  });
});
