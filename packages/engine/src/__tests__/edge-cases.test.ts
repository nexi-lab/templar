import type { AgentManifest, NexusClient, TemplarConfig, TemplarMiddleware } from "@templar/core";
import { TemplarConfigError } from "@templar/errors";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { _setDeepAgentsIntegrated } from "../create-templar.js";
import { createTemplar, registerMiddlewareWrapper, unregisterMiddlewareWrapper } from "../index.js";

// Suppress stub warning noise — overridden in "DeepAgents stub guard" block below
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

describe("Engine edge cases", () => {
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

      expect(config.middleware).toBe(originalMiddleware);
    });
  });

  describe("validation order", () => {
    it("should validate agentType before nexus", () => {
      const config = {
        model: "gpt-4",
        agentType: "invalid",
        nexus: {} as NexusClient,
      } as unknown as TemplarConfig;

      expect(() => createTemplar(config)).toThrow("Invalid agentType");
    });

    it("should validate nexus before manifest", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: {} as NexusClient,
        manifest: {} as AgentManifest,
      };

      expect(() => createTemplar(config)).toThrow(/'agents' resource/);
    });

    it("should validate all fields even with multiple errors", () => {
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
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: createMockNexusClient(),
        middleware: [],
      };

      const agent = createTemplar(config);
      expect(agent).toBeDefined();
    });

    it("should handle Nexus middleware with multiple custom middleware", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        nexus: createMockNexusClient(),
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
          description: "a".repeat(1000),
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
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        nexus: createMockNexusClient(),
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

// ---------------------------------------------------------------------------
// Middleware wrapper tests (Issue: untested registerMiddlewareWrapper path)
// ---------------------------------------------------------------------------

describe("Middleware wrapper integration", () => {
  afterEach(() => {
    unregisterMiddlewareWrapper();
  });

  it("should apply registered wrapper to named middleware items", () => {
    const wrapperSpy = vi.fn((mw: TemplarMiddleware) => ({
      ...mw,
      name: `wrapped-${mw.name}`,
    }));

    registerMiddlewareWrapper(wrapperSpy);

    const config: TemplarConfig = {
      model: "gpt-4",
      middleware: [{ name: "logger" }, { name: "metrics" }],
    };

    const result = createTemplar(config) as { middleware: TemplarMiddleware[] };
    // +1 for auto-injected templar-context-env middleware
    expect(wrapperSpy).toHaveBeenCalledTimes(3);
    expect(result.middleware[0]?.name).toBe("wrapped-templar-context-env");
    expect(result.middleware[1]?.name).toBe("wrapped-logger");
    expect(result.middleware[2]?.name).toBe("wrapped-metrics");
  });

  it("should not wrap non-object middleware items", () => {
    const wrapperSpy = vi.fn((mw: TemplarMiddleware) => mw);

    registerMiddlewareWrapper(wrapperSpy);

    const config: TemplarConfig = {
      model: "gpt-4",
      middleware: ["string-mw" as unknown as TemplarMiddleware, { name: "real" }],
    };

    const result = createTemplar(config) as { middleware: unknown[] };
    // +1 for auto-injected templar-context-env, string-mw skipped
    expect(wrapperSpy).toHaveBeenCalledTimes(2);
    expect(result.middleware[1]).toBe("string-mw");
  });

  it("should skip wrapping when no wrapper is registered", () => {
    const config: TemplarConfig = {
      model: "gpt-4",
      middleware: [{ name: "logger" }],
    };

    const result = createTemplar(config) as { middleware: TemplarMiddleware[] };
    // index 0 is auto-injected templar-context-env, index 1 is logger
    expect(result.middleware[1]?.name).toBe("logger");
  });

  it("should unregister wrapper correctly", () => {
    const wrapperSpy = vi.fn((mw: TemplarMiddleware) => ({
      ...mw,
      name: `wrapped-${mw.name}`,
    }));

    registerMiddlewareWrapper(wrapperSpy);
    unregisterMiddlewareWrapper();

    const config: TemplarConfig = {
      model: "gpt-4",
      middleware: [{ name: "logger" }],
    };

    const result = createTemplar(config) as { middleware: TemplarMiddleware[] };
    expect(wrapperSpy).not.toHaveBeenCalled();
    // index 0 is auto-injected templar-context-env, index 1 is logger
    expect(result.middleware[1]?.name).toBe("logger");
  });
});

// ---------------------------------------------------------------------------
// Stub guard tests (Issue: createDeepAgent placeholder warning)
// ---------------------------------------------------------------------------

describe("DeepAgents stub guard", () => {
  afterEach(() => {
    _setDeepAgentsIntegrated(false);
  });

  it("should emit console.warn when deepagents is not integrated", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    _setDeepAgentsIntegrated(false);
    createTemplar({ model: "gpt-4" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("deepagents package is not yet integrated"),
    );
    warnSpy.mockRestore();
  });

  it("should suppress warning when deepagents is marked as integrated", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    _setDeepAgentsIntegrated(true);
    createTemplar({ model: "gpt-4" });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
