import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { lazyLoad } from "../../lazy-load.js";

describe("lazyLoad", () => {
  it("loads the module and extracts the value", async () => {
    const loader = lazyLoad("test", "node:path", (mod) => {
      return (mod as { join: (...args: string[]) => string }).join;
    });

    const join = await loader();
    expect(typeof join).toBe("function");
    expect(join("a", "b")).toContain("b");
  });

  it("memoizes the result — second call returns cached value", async () => {
    let callCount = 0;
    const loader = lazyLoad("test", "node:path", (mod) => {
      callCount++;
      return (mod as { join: (...args: string[]) => string }).join;
    });

    const first = await loader();
    const second = await loader();

    expect(first).toBe(second);
    expect(callCount).toBe(1);
  });

  it("throws ChannelLoadError when module not found", async () => {
    const loader = lazyLoad("test-channel", "non-existent-module-xyz", (mod) => mod);

    await expect(loader()).rejects.toThrow(ChannelLoadError);
    await expect(loader()).rejects.toThrow(/Failed to load non-existent-module-xyz/);
  });

  it("includes channel name in error message", async () => {
    const loader = lazyLoad("my-channel", "non-existent-module-xyz", (mod) => mod);

    try {
      await loader();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChannelLoadError);
      expect((error as Error).message).toContain("my-channel");
    }
  });

  it("does not cache failed attempts", async () => {
    let attempt = 0;
    // Use a mock that fails first time but succeeds second time
    const loader = lazyLoad("test", "node:path", () => {
      attempt++;
      if (attempt === 1) throw new Error("first attempt fails");
      return "success";
    });

    // Since lazyLoad wraps the import and then calls extract,
    // if the extract throws, it won't cache
    // But with real imports, the import itself would fail.
    // Let's test with the real node:path — extract failing shouldn't cache.
    await expect(loader()).rejects.toThrow("first attempt fails");

    // Second attempt should retry (extract won't fail this time)
    // Note: the module import itself was cached by Node, but our extract runs again
    // Actually, with our implementation, if extract throws, cached is never set
    // But import doesn't re-run because Node caches it. The extract will run again.
    const result = await loader();
    expect(result).toBe("success");
  });
});
