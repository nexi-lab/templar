import { describe, expect, it } from "vitest";
import type { Diagnostic, DiagnosticSeverity } from "vscode-languageserver-protocol";
import { DiagnosticsCache } from "../../diagnostics.js";

function makeDiag(message: string): Diagnostic {
  return {
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 10 },
    },
    message,
    severity: 1 as DiagnosticSeverity,
  };
}

describe("DiagnosticsCache", () => {
  it("stores and retrieves diagnostics", () => {
    const cache = new DiagnosticsCache(10);
    const diags = [makeDiag("err1")];
    cache.set("file:///a.ts", diags);
    expect(cache.get("file:///a.ts")).toEqual(diags);
  });

  it("returns undefined for missing entries", () => {
    const cache = new DiagnosticsCache(10);
    expect(cache.get("file:///missing.ts")).toBeUndefined();
  });

  it("returns frozen arrays (immutable)", () => {
    const cache = new DiagnosticsCache(10);
    cache.set("file:///a.ts", [makeDiag("err1")]);
    const result = cache.get("file:///a.ts")!;
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("evicts LRU when at capacity", () => {
    const cache = new DiagnosticsCache(2);
    cache.set("file:///a.ts", [makeDiag("a")]);
    cache.set("file:///b.ts", [makeDiag("b")]);
    cache.set("file:///c.ts", [makeDiag("c")]); // Should evict a

    expect(cache.get("file:///a.ts")).toBeUndefined();
    expect(cache.get("file:///b.ts")).toBeDefined();
    expect(cache.get("file:///c.ts")).toBeDefined();
  });

  it("updates LRU on get access", () => {
    const cache = new DiagnosticsCache(2);
    cache.set("file:///a.ts", [makeDiag("a")]);
    cache.set("file:///b.ts", [makeDiag("b")]);

    // Access a to make it recently used
    cache.get("file:///a.ts");

    cache.set("file:///c.ts", [makeDiag("c")]); // Should evict b (least recent)

    expect(cache.get("file:///a.ts")).toBeDefined();
    expect(cache.get("file:///b.ts")).toBeUndefined();
    expect(cache.get("file:///c.ts")).toBeDefined();
  });

  it("replaces existing entries", () => {
    const cache = new DiagnosticsCache(10);
    cache.set("file:///a.ts", [makeDiag("old")]);
    cache.set("file:///a.ts", [makeDiag("new")]);
    expect(cache.get("file:///a.ts")).toEqual([makeDiag("new")]);
    expect(cache.size).toBe(1);
  });

  it("deletes entries", () => {
    const cache = new DiagnosticsCache(10);
    cache.set("file:///a.ts", [makeDiag("a")]);
    cache.delete("file:///a.ts");
    expect(cache.get("file:///a.ts")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("clears all entries", () => {
    const cache = new DiagnosticsCache(10);
    cache.set("file:///a.ts", [makeDiag("a")]);
    cache.set("file:///b.ts", [makeDiag("b")]);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("reports correct size", () => {
    const cache = new DiagnosticsCache(10);
    expect(cache.size).toBe(0);
    cache.set("file:///a.ts", [makeDiag("a")]);
    expect(cache.size).toBe(1);
    cache.set("file:///b.ts", [makeDiag("b")]);
    expect(cache.size).toBe(2);
  });

  it("handles empty diagnostics array", () => {
    const cache = new DiagnosticsCache(10);
    cache.set("file:///a.ts", []);
    expect(cache.get("file:///a.ts")).toEqual([]);
  });
});
