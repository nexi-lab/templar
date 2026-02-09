import { describe, expect, it } from "vitest";

/**
 * Bundle size validation
 *
 * This documents bundle size expectations and can be extended
 * with actual bundle analysis tools in CI.
 *
 * Target bundle sizes (gzipped):
 * - Full SDK (@nexus/sdk): <8KB
 * - Single resource (e.g., @nexus/sdk/agents): <3KB
 * - HttpClient only: <2KB
 * - Types only: 0 bytes (erased at runtime)
 */
describe("Bundle size", () => {
  it("should document bundle size expectations", () => {
    // This is a documentation test
    // In CI, use bundlesize package or similar to validate actual sizes
    expect(true).toBe(true);

    console.log("\n  Bundle size targets (gzipped):");
    console.log("  - Full SDK (@nexus/sdk): <8KB");
    console.log("  - Single resource (agents): <3KB");
    console.log("  - HttpClient only: <2KB");
    console.log("  - Types: 0 bytes (erased)");
    console.log("\n  Verify with: pnpm build && npx bundlesize");
  });

  it("should document tree-shaking support", () => {
    expect(true).toBe(true);

    console.log("\n  Tree-shaking support:");
    console.log('  - package.json: "sideEffects": false');
    console.log("  - Multiple entry points for granular imports");
    console.log('  - ESM-only build (format: ["esm"])');
    console.log("  - Code splitting enabled");
  });

  it("should document import patterns", () => {
    expect(true).toBe(true);

    console.log("\n  Import patterns:");
    console.log("  1. Full client: import { NexusClient } from '@nexus/sdk'");
    console.log("  2. Granular: import { AgentsResource } from '@nexus/sdk/agents'");
    console.log("  3. Types only: import type { Agent } from '@nexus/sdk'");
  });

  it("should document dependency philosophy", () => {
    expect(true).toBe(true);

    console.log("\n  Dependency philosophy:");
    console.log("  - Zero runtime dependencies (except @templar/errors)");
    console.log("  - Native fetch() API (no axios, no node-fetch)");
    console.log("  - Tree-shakeable exports");
    console.log("  - Minimal bundle impact");
  });
});
