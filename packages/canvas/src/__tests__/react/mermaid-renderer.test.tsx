/**
 * Unit tests for MermaidRenderer module structure.
 *
 * Full rendering tests require mermaid peer dependency + DOM environment.
 */

import { describe, expect, it } from "vitest";

describe("MermaidRenderer — module", () => {
  it("exports a lazy component", async () => {
    const mod = await import("../../react/mermaid-renderer.js");
    expect(mod.MermaidRenderer).toBeDefined();
    // React.lazy returns an object with $$typeof
    expect(mod.MermaidRenderer.$$typeof).toBeDefined();
  });
});
