import { describe, expect, it } from "vitest";
import { createBraveProvider } from "../../providers/brave.js";
import { createSerperProvider } from "../../providers/serper.js";

const SERPER_KEY = process.env.SERPER_API_KEY ?? "";
const BRAVE_KEY = process.env.BRAVE_API_KEY ?? "";

describe.skipIf(!SERPER_KEY)("Serper E2E", () => {
  it("returns valid search results", { timeout: 10_000 }, async () => {
    const provider = createSerperProvider({
      provider: "serper",
      apiKey: SERPER_KEY,
    });
    const results = await provider.search("TypeScript");

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.title).toBeTruthy();
      expect(result.url).toMatch(/^https?:\/\//);
      expect(typeof result.snippet).toBe("string");
    }
  });
});

describe.skipIf(!BRAVE_KEY)("Brave E2E", () => {
  it("returns valid search results", { timeout: 10_000 }, async () => {
    const provider = createBraveProvider({
      provider: "brave",
      apiKey: BRAVE_KEY,
    });
    const results = await provider.search("TypeScript");

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.title).toBeTruthy();
      expect(result.url).toMatch(/^https?:\/\//);
      expect(typeof result.snippet).toBe("string");
    }
  });
});
