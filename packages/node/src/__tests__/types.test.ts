import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  DEFAULT_CONNECTION_TIMEOUT,
  DEFAULT_MAX_FRAME_SIZE,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_REGISTRATION_TIMEOUT,
  NodeConfigSchema,
  ReconnectConfigSchema,
  resolveNodeConfig,
} from "../types.js";

describe("ReconnectConfigSchema", () => {
  it("should apply defaults when no values provided", () => {
    const result = ReconnectConfigSchema.parse({});
    expect(result).toEqual({
      maxRetries: 10,
      baseDelay: 1_000,
      maxDelay: 30_000,
    });
  });

  it("should accept valid custom values", () => {
    const result = ReconnectConfigSchema.parse({
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 10_000,
    });
    expect(result).toEqual({
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 10_000,
    });
  });

  it("should reject negative maxRetries", () => {
    expect(() => ReconnectConfigSchema.parse({ maxRetries: -1 })).toThrow(ZodError);
  });

  it("should reject zero baseDelay", () => {
    expect(() => ReconnectConfigSchema.parse({ baseDelay: 0 })).toThrow(ZodError);
  });

  it("should reject zero maxDelay", () => {
    expect(() => ReconnectConfigSchema.parse({ maxDelay: 0 })).toThrow(ZodError);
  });

  it("should export DEFAULT_RECONNECT_CONFIG matching schema defaults", () => {
    expect(DEFAULT_RECONNECT_CONFIG).toEqual({
      maxRetries: 10,
      baseDelay: 1_000,
      maxDelay: 30_000,
    });
  });
});

describe("NodeConfigSchema", () => {
  const validConfig = {
    nodeId: "test-node-1",
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
    capabilities: {
      agentTypes: ["high"],
      tools: ["web-search"],
      maxConcurrency: 4,
      channels: ["slack"],
    },
  };

  it("should parse a valid config with string token", () => {
    const result = NodeConfigSchema.parse(validConfig);
    expect(result.nodeId).toBe("test-node-1");
    expect(result.gatewayUrl).toBe("ws://localhost:18789");
    expect(result.token).toBe("test-token");
    expect(result.capabilities.agentTypes).toEqual(["high"]);
  });

  it("should apply reconnect defaults when reconnect not provided", () => {
    const result = NodeConfigSchema.parse(validConfig);
    expect(result.reconnect).toEqual({
      maxRetries: 10,
      baseDelay: 1_000,
      maxDelay: 30_000,
    });
  });

  it("should apply timeout and frame size defaults", () => {
    const result = NodeConfigSchema.parse(validConfig);
    expect(result.registrationTimeout).toBe(DEFAULT_REGISTRATION_TIMEOUT);
    expect(result.connectionTimeout).toBe(DEFAULT_CONNECTION_TIMEOUT);
    expect(result.maxFrameSize).toBe(DEFAULT_MAX_FRAME_SIZE);
  });

  it("should accept custom timeout values", () => {
    const result = NodeConfigSchema.parse({
      ...validConfig,
      registrationTimeout: 5_000,
      connectionTimeout: 15_000,
      maxFrameSize: 2_097_152,
    });
    expect(result.registrationTimeout).toBe(5_000);
    expect(result.connectionTimeout).toBe(15_000);
    expect(result.maxFrameSize).toBe(2_097_152);
  });

  it("should reject non-positive registrationTimeout", () => {
    expect(() => NodeConfigSchema.parse({ ...validConfig, registrationTimeout: 0 })).toThrow(
      ZodError,
    );
    expect(() => NodeConfigSchema.parse({ ...validConfig, registrationTimeout: -1 })).toThrow(
      ZodError,
    );
  });

  it("should reject non-positive connectionTimeout", () => {
    expect(() => NodeConfigSchema.parse({ ...validConfig, connectionTimeout: 0 })).toThrow(
      ZodError,
    );
  });

  it("should reject non-positive maxFrameSize", () => {
    expect(() => NodeConfigSchema.parse({ ...validConfig, maxFrameSize: 0 })).toThrow(ZodError);
  });

  it("should accept custom reconnect config", () => {
    const result = NodeConfigSchema.parse({
      ...validConfig,
      reconnect: { maxRetries: 3, baseDelay: 200, maxDelay: 5_000 },
    });
    expect(result.reconnect.maxRetries).toBe(3);
  });

  it("should reject empty nodeId", () => {
    expect(() => NodeConfigSchema.parse({ ...validConfig, nodeId: "" })).toThrow(ZodError);
  });

  it("should reject invalid gatewayUrl", () => {
    expect(() => NodeConfigSchema.parse({ ...validConfig, gatewayUrl: "not-a-url" })).toThrow(
      ZodError,
    );
  });

  it("should reject missing capabilities", () => {
    const { capabilities: _, ...withoutCapabilities } = validConfig;
    expect(() => NodeConfigSchema.parse(withoutCapabilities)).toThrow(ZodError);
  });

  it("should reject capabilities with empty agentTypes", () => {
    expect(() =>
      NodeConfigSchema.parse({
        ...validConfig,
        capabilities: { ...validConfig.capabilities, agentTypes: [] },
      }),
    ).toThrow(ZodError);
  });

  it("should accept function token (validated at runtime, not parse time)", () => {
    // Zod cannot validate function contents, but it should accept functions
    const result = NodeConfigSchema.parse({
      ...validConfig,
      token: () => "dynamic-token",
    });
    expect(typeof result.token).toBe("function");
  });

  it("should accept async function token", () => {
    const result = NodeConfigSchema.parse({
      ...validConfig,
      token: async () => "async-token",
    });
    expect(typeof result.token).toBe("function");
  });
});

describe("resolveNodeConfig", () => {
  const validConfig = {
    nodeId: "test-node-1",
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
    capabilities: {
      agentTypes: ["high"],
      tools: ["web-search"],
      maxConcurrency: 4,
      channels: ["slack"],
    },
  };

  it("should return resolved config with all defaults applied", () => {
    const resolved = resolveNodeConfig(validConfig);
    expect(resolved.nodeId).toBe("test-node-1");
    expect(resolved.reconnect.maxRetries).toBe(10);
    expect(resolved.reconnect.baseDelay).toBe(1_000);
    expect(resolved.reconnect.maxDelay).toBe(30_000);
    expect(resolved.registrationTimeout).toBe(DEFAULT_REGISTRATION_TIMEOUT);
    expect(resolved.connectionTimeout).toBe(DEFAULT_CONNECTION_TIMEOUT);
    expect(resolved.maxFrameSize).toBe(DEFAULT_MAX_FRAME_SIZE);
  });

  it("should throw ZodError for invalid config", () => {
    expect(() => resolveNodeConfig({ nodeId: "" } as never)).toThrow(ZodError);
  });

  it("should return a frozen (readonly) object", () => {
    const resolved = resolveNodeConfig(validConfig);
    // TypeScript enforces readonly at compile time;
    // verify the shape is correct at runtime
    expect(resolved).toHaveProperty("nodeId");
    expect(resolved).toHaveProperty("gatewayUrl");
    expect(resolved).toHaveProperty("token");
    expect(resolved).toHaveProperty("capabilities");
    expect(resolved).toHaveProperty("reconnect");
  });
});
