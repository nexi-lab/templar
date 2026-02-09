import { ManifestValidationError, NexusClientError, TemplarConfigError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import type { AgentManifest, NexusClient } from "../types.js";
import { validateAgentType, validateManifest, validateNexusClient } from "../validation.js";

describe("validation", () => {
  describe("validateAgentType", () => {
    it("should accept undefined", () => {
      expect(() => validateAgentType(undefined)).not.toThrow();
    });

    it("should accept 'high'", () => {
      expect(() => validateAgentType("high")).not.toThrow();
    });

    it("should accept 'dark'", () => {
      expect(() => validateAgentType("dark")).not.toThrow();
    });

    it("should reject invalid agentType", () => {
      expect(() => validateAgentType("invalid")).toThrow(TemplarConfigError);
      expect(() => validateAgentType("invalid")).toThrow(
        'Invalid agentType: "invalid". Must be one of: high, dark',
      );
    });

    it("should reject empty string", () => {
      expect(() => validateAgentType("")).toThrow(TemplarConfigError);
    });

    it("should reject numeric values", () => {
      expect(() => validateAgentType("123" as string)).toThrow(TemplarConfigError);
    });
  });

  describe("validateNexusClient", () => {
    it("should accept undefined", () => {
      expect(() => validateNexusClient(undefined)).not.toThrow();
    });

    it("should accept valid client", () => {
      const validClient: NexusClient = {
        connect: async () => {},
        disconnect: async () => {},
      };
      expect(() => validateNexusClient(validClient)).not.toThrow();
    });

    it("should reject null", () => {
      expect(() => validateNexusClient(null as unknown as NexusClient)).toThrow(NexusClientError);
      expect(() => validateNexusClient(null as unknown as NexusClient)).toThrow(
        "Nexus client must be an object",
      );
    });

    it("should reject non-object", () => {
      expect(() => validateNexusClient("not an object" as unknown as NexusClient)).toThrow(
        NexusClientError,
      );
    });

    it("should reject client missing connect method", () => {
      const invalidClient = {
        disconnect: async () => {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
      expect(() => validateNexusClient(invalidClient)).toThrow("must have a connect() method");
    });

    it("should reject client missing disconnect method", () => {
      const invalidClient = {
        connect: async () => {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
      expect(() => validateNexusClient(invalidClient)).toThrow("must have a disconnect() method");
    });

    it("should reject client with non-function methods", () => {
      const invalidClient = {
        connect: "not a function",
        disconnect: async () => {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
    });
  });

  describe("validateManifest", () => {
    const validManifest: AgentManifest = {
      name: "test-agent",
      version: "1.0.0",
      description: "Test agent",
    };

    it("should accept undefined", () => {
      expect(() => validateManifest(undefined)).not.toThrow();
    });

    it("should accept valid manifest", () => {
      expect(() => validateManifest(validManifest)).not.toThrow();
    });

    it("should accept manifest with optional fields", () => {
      const manifestWithOptionals: AgentManifest = {
        ...validManifest,
        model: {
          provider: "openai",
          name: "gpt-4",
        },
        tools: [{ name: "search", description: "Search tool" }],
        channels: [{ type: "slack", config: {} }],
        middleware: [{ name: "logger" }],
        permissions: { allowed: ["read"] },
      };
      expect(() => validateManifest(manifestWithOptionals)).not.toThrow();
    });

    it("should reject null", () => {
      expect(() => validateManifest(null as unknown as AgentManifest)).toThrow(
        ManifestValidationError,
      );
      expect(() => validateManifest(null as unknown as AgentManifest)).toThrow(
        "Manifest must be an object",
      );
    });

    it("should reject non-object", () => {
      expect(() => validateManifest("not an object" as unknown as AgentManifest)).toThrow(
        ManifestValidationError,
      );
    });

    it("should reject manifest missing name", () => {
      const manifest = {
        version: "1.0.0",
        description: "Test",
      } as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow('missing required field: "name"');
    });

    it("should reject manifest missing version", () => {
      const manifest = {
        name: "test",
        description: "Test",
      } as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow('missing required field: "version"');
    });

    it("should reject manifest missing description", () => {
      const manifest = {
        name: "test",
        version: "1.0.0",
      } as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow('missing required field: "description"');
    });

    it("should reject empty name", () => {
      const manifest = {
        ...validManifest,
        name: "",
      };

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow('field "name" must be a non-empty string');
    });

    it("should reject invalid version format", () => {
      const manifest = {
        ...validManifest,
        version: "invalid",
      };

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow("must follow semver format");
    });

    it("should accept version with prerelease tag", () => {
      const manifest = {
        ...validManifest,
        version: "1.0.0-alpha.1",
      };

      expect(() => validateManifest(manifest)).not.toThrow();
    });

    it("should reject non-array tools", () => {
      const manifest = {
        ...validManifest,
        tools: "not an array",
      } as unknown as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow("field 'tools' must be an array");
    });

    it("should reject non-array channels", () => {
      const manifest = {
        ...validManifest,
        channels: {},
      } as unknown as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow("field 'channels' must be an array");
    });

    it("should reject non-array middleware", () => {
      const manifest = {
        ...validManifest,
        middleware: "not an array",
      } as unknown as AgentManifest;

      expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
      expect(() => validateManifest(manifest)).toThrow("field 'middleware' must be an array");
    });
  });
});
