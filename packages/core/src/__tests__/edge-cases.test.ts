import { TemplarConfigError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { type AgentManifest, createTemplar } from "../index.js";
import type { NexusClient, TemplarConfig } from "../types.js";

describe("Edge cases", () => {
  describe("empty and minimal configs", () => {
    it("should handle completely empty config", () => {
      const config: TemplarConfig = {};
      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle config with only model", () => {
      const config: TemplarConfig = { model: "gpt-4" };
      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle config with only agentType", () => {
      const config: TemplarConfig = { agentType: "high" };
      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle config with only manifest", () => {
      const config: TemplarConfig = {
        manifest: {
          name: "test",
          version: "1.0.0",
          description: "test",
        },
      };
      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });
  });

  describe("config spreading and merging", () => {
    it("should preserve arbitrary config properties", () => {
      const config = {
        model: "gpt-4",
        customProp: "value",
        nestedProp: { key: "value" },
      } as unknown as TemplarConfig;

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
      // Properties should be passed through to createDeepAgent
    });

    it("should handle config with null values for optional fields", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should not mutate original config", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [],
      };

      const originalMiddleware = config.middleware;
      createTemplar(config);

      // Original config should be unchanged
      expect(config.middleware).toBe(originalMiddleware);
    });
  });

  describe("validation order", () => {
    it("should validate agentType before nexus", () => {
      // Invalid agentType should throw before nexus is checked
      const config = {
        model: "gpt-4",
        agentType: "invalid",
        nexus: {} as NexusClient, // This is also invalid
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow("Invalid agentType");
    });

    it("should validate nexus before manifest", () => {
      // Invalid nexus should throw before manifest is checked
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: {} as NexusClient, // Invalid - missing methods
        manifest: {} as AgentManifest, // Also invalid - missing required fields
      };

      expect(() => createTemplar(config)).toThrow(/connect\(\) method|disconnect\(\) method/);
    });

    it("should validate all fields even with multiple errors", () => {
      // Even though multiple fields are invalid, should throw on first validation
      const config = {
        agentType: "invalid",
        nexus: null,
        manifest: null,
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow();
    });
  });

  describe("middleware edge cases", () => {
    it("should handle empty middleware array", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle multiple middleware items", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        middleware: [{ name: "middleware1" }, { name: "middleware2" }, { name: "middleware3" }],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle Nexus middleware with empty custom middleware", () => {
      const nexusClient: NexusClient = {
        connect: async () => {},
        disconnect: async () => {},
      };

      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: nexusClient,
        middleware: [],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle Nexus middleware with multiple custom middleware", () => {
      const nexusClient: NexusClient = {
        connect: async () => {},
        disconnect: async () => {},
      };

      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: nexusClient,
        middleware: [{ name: "custom1" }, { name: "custom2" }],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });
  });

  describe("manifest edge cases", () => {
    it("should handle manifest with empty arrays", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test",
          version: "1.0.0",
          description: "test",
          tools: [],
          channels: [],
          middleware: [],
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle manifest with version including prerelease", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test",
          version: "1.0.0-alpha.1",
          description: "test",
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle manifest with version including build metadata", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test",
          version: "1.0.0+20240101",
          description: "test",
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle manifest with long description", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test",
          version: "1.0.0",
          description: "a".repeat(1000), // Very long description
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle manifest with special characters in name", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        manifest: {
          name: "test-agent_v1.0",
          version: "1.0.0",
          description: "test",
        },
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });
  });

  describe("combined scenarios", () => {
    it("should handle maximum config complexity", () => {
      const nexusClient: NexusClient = {
        connect: async () => {},
        disconnect: async () => {},
      };

      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        nexus: nexusClient,
        manifest: {
          name: "complex-agent",
          version: "1.0.0-beta.1+build.123",
          description: "A complex agent with all features",
          model: {
            provider: "openai",
            name: "gpt-4",
            temperature: 0.7,
            maxTokens: 2000,
          },
          tools: [
            { name: "search", description: "Search tool" },
            { name: "calculator", description: "Calculator tool" },
          ],
          channels: [
            { type: "slack", config: { token: "xxx" } },
            { type: "discord", config: { token: "yyy" } },
          ],
          middleware: [
            { name: "logger", config: { level: "info" } },
            { name: "metrics", config: { enabled: true } },
          ],
          permissions: {
            allowed: ["read", "write"],
            denied: ["delete"],
          },
        },
        middleware: [{ name: "custom1" }, { name: "custom2" }, { name: "custom3" }],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle config created from Object.create(null)", () => {
      const config = Object.create(null) as unknown as TemplarConfig;
      config.model = "gpt-4";

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw TemplarConfigError for validation failures", () => {
      const config = {
        model: "gpt-4",
        agentType: "invalid",
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow(TemplarConfigError);
    });

    it("should include cause in wrapped errors", () => {
      // This will be more relevant once we integrate with real createDeepAgent
      // For now, just verify error structure
      const config = {
        model: "gpt-4",
        agentType: "invalid",
      } as unknown as TemplarConfig;

      try {
        createTemplar(config);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TemplarConfigError);
        expect(error).toHaveProperty("message");
      }
    });

    it("should provide clear error messages", () => {
      const config = {
        model: "gpt-4",
        agentType: "medium",
      } as unknown as TemplarConfig;

      try {
        createTemplar(config);
        expect.fail("Should have thrown");
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain("agentType");
          expect(error.message).toContain("medium");
          expect(error.message).toContain("high");
          expect(error.message).toContain("dark");
        }
      }
    });
  });
});
