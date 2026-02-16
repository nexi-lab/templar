import type { NexusClient, TemplarConfig } from "@templar/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _setDeepAgentsIntegrated } from "../create-templar.js";
import { createTemplar } from "../index.js";

// Suppress stub warning noise in performance benchmarks
beforeAll(() => _setDeepAgentsIntegrated(true));
afterAll(() => _setDeepAgentsIntegrated(false));

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

      expect(avgTime).toBeLessThan(1);
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

      expect(avgTime).toBeLessThan(2);
    });

    it("should handle validation overhead efficiently", () => {
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

      const iterations = 250;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const config of validConfigs) {
          createTemplar(config);
        }
      }

      const duration = performance.now() - start;
      const avgTime = duration / (iterations * validConfigs.length);

      expect(avgTime).toBeLessThan(1);
    });
  });

  describe("memory usage", () => {
    it("should not leak memory on repeated creation", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [],
      };

      const agents: unknown[] = [];
      for (let i = 0; i < 1000; i++) {
        agents.push(createTemplar(config));
      }

      expect(agents).toHaveLength(1000);
      expect(agents.every((a) => a !== undefined)).toBe(true);
    });

    it("should not retain references to config objects", () => {
      const largeObject = { data: new Array(1000).fill("x") };
      const config: TemplarConfig = {
        model: "gpt-4",
        customData: largeObject,
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle middleware array creation efficiently", () => {
      const nexusClient = createMockNexusClient();

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
      expect(duration).toBeLessThan(100);
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

      expect(duration).toBeLessThan(1000);
      expect(avgTime).toBeLessThan(0.1);
    });
  });
});
