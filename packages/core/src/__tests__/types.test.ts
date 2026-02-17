import { describe, expect, it } from "vitest";
import type {
  AgentManifest,
  ChannelAdapter,
  ChannelCapabilities,
  ChannelConfig,
  DeepAgentConfig,
  ExecutionLimitsConfig,
  LoopDetection,
  LoopDetectionConfig,
  MessageHandler,
  MiddlewareConfig,
  ModelConfig,
  NexusClient,
  OutboundMessage,
  PermissionConfig,
  StopReason,
  TemplarConfig,
  TemplarMiddleware,
  ToolConfig,
} from "../index.js";

describe("Type exports", () => {
  describe("TemplarConfig", () => {
    it("should accept valid config", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
      };
      expect(config).toBeDefined();
    });

    it("should accept minimal config", () => {
      const config: TemplarConfig = {};
      expect(config).toBeDefined();
    });

    it("should accept config with all optional fields", () => {
      const nexusClient = {
        agents: {},
        tools: {},
        channels: {},
        memory: {},
        withRetry: () => nexusClient,
        withTimeout: () => nexusClient,
      } as unknown as NexusClient;

      const manifest: AgentManifest = {
        name: "test",
        version: "1.0.0",
        description: "test",
      };

      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "dark",
        nexus: nexusClient,
        manifest,
        middleware: [],
      };
      expect(config).toBeDefined();
    });
  });

  describe("AgentManifest", () => {
    it("should accept valid manifest", () => {
      const manifest: AgentManifest = {
        name: "test-agent",
        version: "1.0.0",
        description: "Test agent description",
      };
      expect(manifest).toBeDefined();
    });

    it("should accept manifest with optional fields", () => {
      const manifest: AgentManifest = {
        name: "test-agent",
        version: "1.0.0",
        description: "Test agent description",
        model: {
          provider: "openai",
          name: "gpt-4",
          temperature: 0.7,
          maxTokens: 1000,
        },
        tools: [
          {
            name: "search",
            description: "Search tool",
            parameters: { query: "string" },
          },
        ],
        channels: [
          {
            type: "slack",
            config: { token: "xxx" },
          },
        ],
        middleware: [
          {
            name: "logger",
            config: { level: "info" },
          },
        ],
        permissions: {
          allowed: ["read", "write"],
          denied: ["delete"],
        },
      };
      expect(manifest).toBeDefined();
    });
  });

  describe("NexusClient", () => {
    it("should accept valid client", () => {
      const client = {
        agents: {},
        tools: {},
        channels: {},
        memory: {},
        withRetry: () => client,
        withTimeout: () => client,
      } as unknown as NexusClient;
      expect(client).toBeDefined();
    });
  });

  describe("ChannelAdapter", () => {
    it("should accept valid adapter", () => {
      const capabilities: ChannelCapabilities = {
        text: { supported: true, maxLength: 4000 },
        richText: { supported: true, formats: ["markdown"] },
        images: { supported: true, maxSize: 10_000_000, formats: ["png", "jpg"] },
        files: { supported: true, maxSize: 50_000_000 },
        buttons: { supported: true, maxButtons: 5 },
        threads: { supported: true, nested: false },
        reactions: { supported: true },
        typingIndicator: { supported: true },
        readReceipts: { supported: true },
        groups: { supported: true, maxMembers: 100 },
      };

      const adapter: ChannelAdapter = {
        name: "slack",
        capabilities,
        connect: async () => {},
        disconnect: async () => {},
        send: async (_message) => {},
        onMessage: (_handler) => {},
      };
      expect(adapter).toBeDefined();
    });
  });

  describe("ModelConfig", () => {
    it("should accept minimal model config", () => {
      const config: ModelConfig = {
        provider: "openai",
        name: "gpt-4",
      };
      expect(config).toBeDefined();
    });

    it("should accept model config with optional fields", () => {
      const config: ModelConfig = {
        provider: "anthropic",
        name: "claude-3-opus",
        temperature: 0.7,
        maxTokens: 2000,
      };
      expect(config).toBeDefined();
    });
  });

  describe("ToolConfig", () => {
    it("should accept minimal tool config", () => {
      const config: ToolConfig = {
        name: "search",
        description: "Search the web",
      };
      expect(config).toBeDefined();
    });

    it("should accept tool config with parameters", () => {
      const config: ToolConfig = {
        name: "search",
        description: "Search the web",
        parameters: {
          query: { type: "string", required: true },
          limit: { type: "number", default: 10 },
        },
      };
      expect(config).toBeDefined();
    });
  });

  describe("ChannelConfig", () => {
    it("should accept channel config", () => {
      const config: ChannelConfig = {
        type: "slack",
        config: {
          token: "xxx",
          channel: "#general",
        },
      };
      expect(config).toBeDefined();
    });
  });

  describe("MiddlewareConfig", () => {
    it("should accept minimal middleware config", () => {
      const config: MiddlewareConfig = {
        name: "logger",
      };
      expect(config).toBeDefined();
    });

    it("should accept middleware config with config object", () => {
      const config: MiddlewareConfig = {
        name: "logger",
        config: {
          level: "info",
          format: "json",
        },
      };
      expect(config).toBeDefined();
    });
  });

  describe("PermissionConfig", () => {
    it("should accept minimal permission config", () => {
      const config: PermissionConfig = {
        allowed: ["read"],
      };
      expect(config).toBeDefined();
    });

    it("should accept permission config with denied list", () => {
      const config: PermissionConfig = {
        allowed: ["read", "write"],
        denied: ["delete"],
      };
      expect(config).toBeDefined();
    });
  });

  describe("OutboundMessage", () => {
    it("should accept minimal message with blocks", () => {
      const message: OutboundMessage = {
        channelId: "channel-123",
        blocks: [{ type: "text", content: "Hello, world!" }],
      };
      expect(message).toBeDefined();
    });

    it("should accept message with metadata and threadId", () => {
      const message: OutboundMessage = {
        channelId: "channel-123",
        blocks: [{ type: "text", content: "Hello, world!" }],
        threadId: "thread-456",
        metadata: {
          userId: "user-123",
          timestamp: Date.now(),
        },
      };
      expect(message).toBeDefined();
    });

    it("should accept message with mixed content blocks", () => {
      const message: OutboundMessage = {
        channelId: "channel-123",
        blocks: [
          { type: "text", content: "Check this out" },
          { type: "image", url: "https://example.com/img.png", alt: "An image" },
          { type: "button", buttons: [{ label: "OK", action: "confirm", style: "primary" }] },
        ],
      };
      expect(message).toBeDefined();
    });
  });

  describe("MessageHandler", () => {
    it("should accept void handler", () => {
      const handler: MessageHandler = (_message) => {
        // Process message
      };
      expect(handler).toBeDefined();
    });

    it("should accept async handler", () => {
      const handler: MessageHandler = async (_message) => {
        // Process message asynchronously
        await Promise.resolve();
      };
      expect(handler).toBeDefined();
    });
  });

  describe("TemplarMiddleware", () => {
    it("should accept middleware with name", () => {
      const middleware: TemplarMiddleware = {
        name: "logger",
      };
      expect(middleware).toBeDefined();
    });

    it("should accept middleware with lifecycle hooks", () => {
      const middleware: TemplarMiddleware = {
        name: "logger",
        onSessionStart: async () => {},
        onAfterTurn: async () => {},
      };
      expect(middleware).toBeDefined();
    });
  });

  describe("DeepAgentConfig", () => {
    it("should accept minimal config", () => {
      const config: DeepAgentConfig = {};
      expect(config).toBeDefined();
    });

    it("should accept config with model and middleware", () => {
      const config: DeepAgentConfig = {
        model: "gpt-4",
        middleware: [],
      };
      expect(config).toBeDefined();
    });

    it("should allow arbitrary additional properties", () => {
      const config: DeepAgentConfig = {
        model: "gpt-4",
        temperature: 0.7,
        customField: "value",
      };
      expect(config).toBeDefined();
    });
  });

  describe("ExecutionLimitsConfig", () => {
    it("should accept empty config (all defaults)", () => {
      const config: ExecutionLimitsConfig = {};
      expect(config).toBeDefined();
    });

    it("should accept config with hard limits only", () => {
      const config: ExecutionLimitsConfig = {
        maxIterations: 50,
        maxExecutionTimeMs: 60_000,
      };
      expect(config).toBeDefined();
    });

    it("should accept config with loop detection", () => {
      const config: ExecutionLimitsConfig = {
        maxIterations: 25,
        loopDetection: {
          enabled: true,
          windowSize: 5,
          repeatThreshold: 3,
          maxCycleLength: 4,
          onDetected: "stop",
        },
      };
      expect(config).toBeDefined();
    });

    it("should accept config with minimal loop detection", () => {
      const config: ExecutionLimitsConfig = {
        loopDetection: { enabled: false },
      };
      expect(config).toBeDefined();
    });
  });

  describe("LoopDetectionConfig", () => {
    it("should accept empty config", () => {
      const config: LoopDetectionConfig = {};
      expect(config).toBeDefined();
    });

    it("should accept all onDetected values", () => {
      const warn: LoopDetectionConfig = { onDetected: "warn" };
      const stop: LoopDetectionConfig = { onDetected: "stop" };
      const error: LoopDetectionConfig = { onDetected: "error" };
      expect(warn).toBeDefined();
      expect(stop).toBeDefined();
      expect(error).toBeDefined();
    });
  });

  describe("LoopDetection", () => {
    it("should accept tool_cycle detection", () => {
      const detection: LoopDetection = {
        type: "tool_cycle",
        cyclePattern: ["search", "analyze"],
        repetitions: 3,
        windowSize: 5,
      };
      expect(detection).toBeDefined();
      expect(detection.type).toBe("tool_cycle");
    });

    it("should accept output_repeat detection", () => {
      const detection: LoopDetection = {
        type: "output_repeat",
        repetitions: 3,
        windowSize: 5,
      };
      expect(detection).toBeDefined();
      expect(detection.type).toBe("output_repeat");
    });
  });

  describe("StopReason", () => {
    it("should narrow on kind field", () => {
      const reasons: StopReason[] = [
        { kind: "completed" },
        { kind: "iteration_limit", count: 25, max: 25 },
        { kind: "timeout", elapsedMs: 120_000, maxMs: 120_000 },
        {
          kind: "loop_detected",
          detection: {
            type: "tool_cycle",
            cyclePattern: ["search"],
            repetitions: 3,
            windowSize: 5,
          },
        },
        { kind: "budget_exhausted" },
        { kind: "user_cancelled" },
      ];
      expect(reasons).toHaveLength(6);

      // Verify type narrowing works
      for (const reason of reasons) {
        switch (reason.kind) {
          case "completed":
          case "budget_exhausted":
          case "user_cancelled":
            break;
          case "iteration_limit":
            expect(reason.count).toBeDefined();
            expect(reason.max).toBeDefined();
            break;
          case "timeout":
            expect(reason.elapsedMs).toBeDefined();
            expect(reason.maxMs).toBeDefined();
            break;
          case "loop_detected":
            expect(reason.detection).toBeDefined();
            break;
        }
      }
    });
  });

  describe("TemplarConfig with executionLimits", () => {
    it("should accept config with executionLimits", () => {
      const config: TemplarConfig = {
        model: "gpt-4",
        agentType: "high",
        executionLimits: {
          maxIterations: 50,
          maxExecutionTimeMs: 60_000,
          loopDetection: {
            enabled: true,
            windowSize: 5,
          },
        },
      };
      expect(config).toBeDefined();
    });
  });

  describe("ChannelCapabilities", () => {
    it("should accept full capabilities with grouped structure", () => {
      const capabilities: ChannelCapabilities = {
        text: { supported: true, maxLength: 4000 },
        richText: { supported: true, formats: ["markdown", "html"] },
        images: { supported: true, maxSize: 10_000_000, formats: ["png", "jpg", "gif", "webp"] },
        files: { supported: true, maxSize: 50_000_000 },
        buttons: { supported: true, maxButtons: 5 },
        threads: { supported: true, nested: false },
        reactions: { supported: true },
        typingIndicator: { supported: true },
        readReceipts: { supported: true },
        voiceMessages: { supported: true, maxDuration: 300, formats: ["ogg", "mp3"] },
        groups: { supported: true, maxMembers: 100 },
      };
      expect(capabilities).toBeDefined();
    });

    it("should accept minimal capabilities (text-only)", () => {
      const capabilities: ChannelCapabilities = {
        text: { supported: true, maxLength: 160 },
      };
      expect(capabilities).toBeDefined();
    });

    it("should accept empty capabilities (no features)", () => {
      const capabilities: ChannelCapabilities = {};
      expect(capabilities).toBeDefined();
    });
  });
});
