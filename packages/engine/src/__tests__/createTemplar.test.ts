import type { AgentManifest, NexusClient, TemplarConfig } from "@templar/core";
import { TemplarConfigError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { createTemplar } from "../index.js";

/**
 * Create a mock NexusClient that satisfies the real SDK shape.
 */
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

describe("createTemplar", () => {
  describe("basic functionality", () => {
    it("should create agent with minimal config", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should create agent with empty config", () => {
      const config: TemplarConfig = {};
      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should pass through config to createDeepAgent", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        temperature: 0.7,
      };

      const agent = createTemplar(config);
      // Agent should contain config (implementation detail of placeholder)
      expect(agent).toBeDefined();
    });
  });

  describe("agentType handling", () => {
    it("should accept agentType 'high'", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should accept agentType 'dark'", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "dark",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should accept undefined agentType", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should throw on invalid agentType", () => {
      const config = {
        model: "gpt-4",
        agentType: "invalid",
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow(TemplarConfigError);
      expect(() => createTemplar(config)).toThrow('Invalid agentType: "invalid"');
    });
  });

  describe("Nexus client handling", () => {
    it("should accept valid Nexus client", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: createMockNexusClient(),
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should work without Nexus client", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should throw on invalid Nexus client (missing agents resource)", () => {
      const invalidClient = {
        memory: {},
      } as unknown as NexusClient;

      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: invalidClient,
      };

      expect(() => createTemplar(config)).toThrow("'agents' resource");
    });

    it("should throw on invalid Nexus client (missing memory resource)", () => {
      const invalidClient = {
        agents: {},
      } as unknown as NexusClient;

      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: invalidClient,
      };

      expect(() => createTemplar(config)).toThrow("'memory' resource");
    });

    it("should throw on invalid Nexus client (null)", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: null as unknown as NexusClient,
      };

      expect(() => createTemplar(config)).toThrow("must be an object");
    });
  });

  describe("manifest handling", () => {
    it("should accept valid manifest", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test-agent",
          version: "1.0.0",
          description: "Test agent",
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should accept manifest with optional fields", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test-agent",
          version: "1.0.0",
          description: "Test agent",
          model: {
            provider: "openai",
            name: "gpt-4",
          },
          tools: [
            {
              name: "search",
              description: "Search tool",
            },
          ],
          channels: [
            {
              type: "slack",
              config: {},
            },
          ],
          middleware: [
            {
              name: "logger",
            },
          ],
          permissions: {
            allowed: ["read", "write"],
          },
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should work without manifest", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should throw on invalid manifest (missing name)", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          version: "1.0.0",
          description: "Test",
        } as AgentManifest,
      };

      expect(() => createTemplar(config)).toThrow('missing required field: "name"');
    });

    it("should throw on invalid manifest (bad version)", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test",
          version: "invalid",
          description: "Test",
        },
      };

      expect(() => createTemplar(config)).toThrow("must follow semver format");
    });
  });

  describe("middleware injection", () => {
    it("should handle custom middleware", () => {
      const customMiddleware = { name: "custom" };
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [customMiddleware],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle empty middleware array", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle undefined middleware", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should accept nexus client alongside middleware", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: createMockNexusClient(),
        middleware: [{ name: "custom" }],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle config with all features", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        nexus: createMockNexusClient(),
        manifest: {
          name: "test-agent",
          version: "1.0.0",
          description: "Test agent",
        },
        middleware: [{ name: "custom" }],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle config with extra properties", () => {
      const config = {
        model: "gpt-4",
        customField: "custom-value",
        anotherField: 123,
      } as unknown as TemplarConfig;

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should validate before attempting to create agent", () => {
      // If validation fails, should throw before calling createDeepAgent
      const config = {
        model: "gpt-4",
        agentType: "invalid",
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow(TemplarConfigError);
    });

    it("should handle multiple validation errors by throwing first one", () => {
      const config = {
        model: "gpt-4",
        agentType: "invalid",
        nexus: null,
        manifest: {},
      } as unknown as TemplarConfig;

      // Should throw on first validation error (agentType)
      expect(() => createTemplar(config)).toThrow();
    });
  });
});
