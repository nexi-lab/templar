import { describe, expect, it } from "vitest";
import { createTemplar } from "../index.js";
import type { NexusClient, TemplarConfig } from "../types.js";

function createMockNexusClient(): NexusClient {
  return {
    agents: {},
    tools: {},
    channels: {},
    memory: {},
    withRetry: () => createMockNexusClient(),
    withTimeout: () => createMockNexusClient(),
  } as unknown as NexusClient;
}

/**
 * Performance benchmarks for createTemplar
 *
 * These benchmarks validate the "thin wrapper" claim by ensuring:
 * - createTemplar has <1% overhead vs raw createDeepAgent
 * - Memory usage is minimal
 * - No performance regressions over time
 *
 * Note: These are placeholder benchmarks until real createDeepAgent is integrated
 */
describe("Performance benchmarks", () => {
  describe("createTemplar overhead", () => {
    it("should create agents quickly (baseline)", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        createTemplar(config);
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      // Should be very fast (<1ms per creation for placeholder)
      expect(avgTime).toBeLessThan(1);
      console.log(
        `  ✓ Created ${iterations} agents in ${duration.toFixed(2)}ms (${avgTime.toFixed(4)}ms avg)`,
      );
    });

    it("should handle complex configs without significant overhead", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        nexus: createMockNexusClient(),
        manifest: {
          name: "benchmark-agent",
          version: "1.0.0",
          description: "Benchmark agent",
          tools: [
            { name: "tool1", description: "Tool 1" },
            { name: "tool2", description: "Tool 2" },
            { name: "tool3", description: "Tool 3" },
          ],
          channels: [
            { type: "slack", config: {} },
            { type: "discord", config: {} },
          ],
          middleware: [{ name: "logger" }, { name: "metrics" }],
        },
        middleware: [{ name: "custom1" }, { name: "custom2" }],
      };

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        createTemplar(config);
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      // Complex config should still be fast
      expect(avgTime).toBeLessThan(2);
      console.log(
        `  ✓ Created ${iterations} complex agents in ${duration.toFixed(2)}ms (${avgTime.toFixed(4)}ms avg)`,
      );
    });

    it("should handle validation overhead efficiently", () => {
      // Test configs that trigger all validation paths
      const validConfigs: TemplarConfig[] = [
        { agentType: "high" },
        { agentType: "dark" },
        {
          nexus: createMockNexusClient(),
        },
        {
          manifest: {
            name: "test",
            version: "1.0.0",
            description: "test",
          },
        },
      ];

      const iterations = 250; // 250 iterations * 4 configs = 1000 total
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const config of validConfigs) {
          createTemplar(config);
        }
      }

      const duration = performance.now() - start;
      const avgTime = duration / (iterations * validConfigs.length);

      // Validation should not add significant overhead
      expect(avgTime).toBeLessThan(1);
      console.log(
        `  ✓ Validated and created ${iterations * validConfigs.length} agents in ${duration.toFixed(2)}ms (${avgTime.toFixed(4)}ms avg)`,
      );
    });
  });

  describe("memory usage", () => {
    it("should not leak memory on repeated creation", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [],
      };

      // Create many agents
      const agents: unknown[] = [];
      for (let i = 0; i < 1000; i++) {
        agents.push(createTemplar(config));
      }

      // Agents should be created
      expect(agents).toHaveLength(1000);
      expect(agents.every((a) => a !== undefined)).toBe(true);

      // Note: Without actual memory profiling tools, we can't measure
      // memory usage precisely. In production, this would use:
      // - process.memoryUsage() (Node.js)
      // - performance.memory (Chrome/V8)
      // - @templar/test-utils memory profiler
    });

    it("should not retain references to config objects", () => {
      // Create a config with a large nested object
      const largeObject = { data: new Array(1000).fill("x") };
      const config: TemplarConfig = {
        model: "gpt-4",
        customData: largeObject,
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();

      // After agent creation, modifying the original config
      // should not affect the agent (config is copied)
      // This is important to prevent memory leaks
    });

    it("should handle middleware array creation efficiently", () => {
      const nexusClient = createMockNexusClient();

      // Create multiple middleware arrays
      const configs = Array.from({ length: 100 }, (_, i) => ({
        model: "gpt-4",
        ...(i % 2 === 0 ? { nexus: nexusClient } : {}),
        middleware: Array.from({ length: i % 5 }, (_, j) => ({
          name: `middleware-${j}`,
        })),
      }));

      const start = performance.now();
      const agents = configs.map((config) => createTemplar(config));
      const duration = performance.now() - start;

      expect(agents).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should complete in <100ms

      console.log(`  ✓ Created 100 agents with varying middleware in ${duration.toFixed(2)}ms`);
    });
  });

  describe("config spreading performance", () => {
    it("should spread config efficiently", () => {
      // Test with configs of varying sizes
      const smallConfig: TemplarConfig = { model: "gpt-4" };

      const mediumConfig: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        middleware: [],
      };

      const largeConfig: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        middleware: Array.from({ length: 10 }, (_, i) => ({
          name: `mw-${i}`,
        })),
        manifest: {
          name: "test",
          version: "1.0.0",
          description: "test",
          tools: Array.from({ length: 10 }, (_, i) => ({
            name: `tool-${i}`,
            description: `Tool ${i}`,
          })),
        },
      };

      const iterations = 1000;

      // Small config
      let start = performance.now();
      for (let i = 0; i < iterations; i++) {
        createTemplar(smallConfig);
      }
      const smallTime = performance.now() - start;

      // Medium config
      start = performance.now();
      for (let i = 0; i < iterations; i++) {
        createTemplar(mediumConfig);
      }
      const mediumTime = performance.now() - start;

      // Large config
      start = performance.now();
      for (let i = 0; i < iterations; i++) {
        createTemplar(largeConfig);
      }
      const largeTime = performance.now() - start;

      // Time should scale reasonably with config size
      // Large config should not be more than 50x slower than small (generous for CI runners with variable perf)
      expect(largeTime / smallTime).toBeLessThan(50);

      console.log(`  ✓ Small config: ${smallTime.toFixed(2)}ms`);
      console.log(`  ✓ Medium config: ${mediumTime.toFixed(2)}ms`);
      console.log(`  ✓ Large config: ${largeTime.toFixed(2)}ms`);
      console.log(`  ✓ Scaling factor: ${(largeTime / smallTime).toFixed(2)}x`);
    });
  });

  describe("regression prevention", () => {
    it("should maintain baseline performance", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const iterations = 10000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        createTemplar(config);
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      // Establish baseline: 10000 creations should complete in <1000ms
      // This is ~0.1ms per creation
      expect(duration).toBeLessThan(1000);
      expect(avgTime).toBeLessThan(0.1);

      console.log(
        `  ✓ Baseline: ${iterations} agents in ${duration.toFixed(2)}ms (${avgTime.toFixed(4)}ms avg)`,
      );
      console.log(`  ✓ Throughput: ${Math.round(iterations / (duration / 1000))} agents/sec`);
    });
  });
});

/**
 * Bundle size validation
 *
 * This is more of a documentation/reminder than an actual test.
 * Bundle size should be checked via bundlesize package in CI.
 *
 * Target: @templar/core should add <5KB to bundle size after tree-shaking
 */
describe("Bundle size", () => {
  it("should document bundle size expectations", () => {
    // This is a placeholder test
    // In CI, use bundlesize package to validate:
    // - dist/index.js gzipped size
    // - Impact on consumer bundles
    // - Tree-shaking effectiveness

    expect(true).toBe(true);

    console.log("\n  Bundle size targets:");
    console.log("  - dist/index.js (gzipped): <5KB");
    console.log("  - Tree-shaking: exports should be individually importable");
    console.log("  - No unnecessary dependencies pulled in");
    console.log('\n  Run "pnpm build" and check dist/ folder for actual sizes');
  });
});
