import { describe, expect, it } from "vitest";
import type {
	AgentManifest,
	ChannelAdapter,
	ChannelCapabilities,
	ChannelConfig,
	DeepAgentConfig,
	MessageHandler,
	MiddlewareConfig,
	ModelConfig,
	NexusClient,
	OutboundMessage,
	PermissionConfig,
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
			const nexusClient: NexusClient = {
				connect: async () => {},
				disconnect: async () => {},
			};

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
			const client: NexusClient = {
				connect: async () => {},
				disconnect: async () => {},
			};
			expect(client).toBeDefined();
		});

		it("should allow additional properties", () => {
			const client: NexusClient = {
				connect: async () => {},
				disconnect: async () => {},
				apiKey: "xxx",
				baseUrl: "https://api.example.com",
			};
			expect(client).toBeDefined();
		});
	});

	describe("ChannelAdapter", () => {
		it("should accept valid adapter", () => {
			const capabilities: ChannelCapabilities = {
				text: true,
				richText: true,
				images: true,
				files: true,
				buttons: true,
				threads: true,
				reactions: true,
				typingIndicator: true,
				readReceipts: true,
				voiceMessages: false,
				groups: true,
				maxMessageLength: 4000,
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
		it("should accept minimal message", () => {
			const message: OutboundMessage = {
				content: "Hello, world!",
				channelId: "channel-123",
			};
			expect(message).toBeDefined();
		});

		it("should accept message with metadata", () => {
			const message: OutboundMessage = {
				content: "Hello, world!",
				channelId: "channel-123",
				metadata: {
					userId: "user-123",
					timestamp: Date.now(),
				},
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

		it("should accept middleware with additional properties", () => {
			const middleware: TemplarMiddleware = {
				name: "logger",
				level: "info",
				handler: async () => {},
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

	describe("ChannelCapabilities", () => {
		it("should accept full capabilities", () => {
			const capabilities: ChannelCapabilities = {
				text: true,
				richText: true,
				images: true,
				files: true,
				buttons: true,
				threads: true,
				reactions: true,
				typingIndicator: true,
				readReceipts: true,
				voiceMessages: true,
				groups: true,
				maxMessageLength: 4000,
			};
			expect(capabilities).toBeDefined();
		});

		it("should accept minimal capabilities", () => {
			const capabilities: ChannelCapabilities = {
				text: true,
				richText: false,
				images: false,
				files: false,
				buttons: false,
				threads: false,
				reactions: false,
				typingIndicator: false,
				readReceipts: false,
				voiceMessages: false,
				groups: false,
				maxMessageLength: 1000,
			};
			expect(capabilities).toBeDefined();
		});
	});
});
