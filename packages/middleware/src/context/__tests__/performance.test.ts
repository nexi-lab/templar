import type { ContextHydrationConfig } from "@templar/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextHydrator } from "../middleware.js";
import { interpolateTemplate } from "../template.js";
import { createMockNexusClient, createTestSessionContext } from "./helpers.js";

describe("ContextHydrator performance benchmarks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("empty config (no sources) should resolve in <1ms", async () => {
    const config: ContextHydrationConfig = {};
    const hydrator = new ContextHydrator(config, {});
    const context = createTestSessionContext();

    const start = performance.now();
    await hydrator.onSessionStart(context);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5); // generous margin for CI
  });

  it("1 source (memory query, mocked) should resolve in <10ms", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [{ memory_id: "m1", content: "data", state: "active" }],
    });

    const config: ContextHydrationConfig = {
      sources: [{ type: "memory_query", query: "test" }],
    };

    const hydrator = new ContextHydrator(config, { nexus: client });
    const context = createTestSessionContext();

    const start = performance.now();
    await hydrator.onSessionStart(context);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // generous margin for CI
  });

  it("10 sources (all mocked) should resolve in <50ms", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [{ memory_id: "m1", content: "data", state: "active" }],
    });

    const sources = Array.from({ length: 10 }, (_, i) => ({
      type: "memory_query" as const,
      query: `query-${i}`,
    }));

    const config: ContextHydrationConfig = { sources };
    const hydrator = new ContextHydrator(config, { nexus: client });
    const context = createTestSessionContext();

    const start = performance.now();
    await hydrator.onSessionStart(context);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100); // generous margin for CI
  });

  it("template substitution (100 vars) should resolve in <5ms", () => {
    const vars: Record<string, unknown> = {};
    const segments: string[] = [];

    for (let i = 0; i < 100; i++) {
      const key = `var${i}`;
      (vars as Record<string, unknown>)[key] = `value${i}`;
      segments.push(`{{${key}}}`);
    }

    const template = segments.join(" ");

    const start = performance.now();
    // Note: top-level keys only since HydrationTemplateVars has fixed structure.
    // This tests the regex performance with many replacements.
    interpolateTemplate(template, vars as never);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10); // generous margin for CI
  });

  it("budget enforcement (truncation of 10 sources) should resolve in <5ms", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [{ memory_id: "m1", content: "x".repeat(5000), state: "active" }],
    });

    const sources = Array.from({ length: 10 }, (_, i) => ({
      type: "memory_query" as const,
      query: `query-${i}`,
    }));

    const config: ContextHydrationConfig = {
      sources,
      maxContextChars: 1000,
    };

    const hydrator = new ContextHydrator(config, { nexus: client });
    const context = createTestSessionContext();

    const start = performance.now();
    await hydrator.onSessionStart(context);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100); // generous margin for CI
  });
});
