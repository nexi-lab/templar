import type { AgentManifest, ExecutionLimitsConfig, NexusClient } from "@templar/core";
import { ManifestValidationError, NexusClientError, TemplarConfigError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import {
  validateAgentType,
  validateExecutionLimits,
  validateManifest,
  validateNexusClient,
} from "../validation.js";

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
      const validClient = {
        agents: {},
        tools: {},
        channels: {},
        memory: {},
        withRetry: () => validClient,
        withTimeout: () => validClient,
      } as unknown as NexusClient;
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

    it("should reject client missing agents resource", () => {
      const invalidClient = {
        memory: {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
      expect(() => validateNexusClient(invalidClient)).toThrow("'agents' resource");
    });

    it("should reject client missing memory resource", () => {
      const invalidClient = {
        agents: {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
      expect(() => validateNexusClient(invalidClient)).toThrow("'memory' resource");
    });

    it("should reject client with non-object resources", () => {
      const invalidClient = {
        agents: "not an object",
        memory: {},
      } as unknown as NexusClient;

      expect(() => validateNexusClient(invalidClient)).toThrow(NexusClientError);
    });
  });

  describe("validateExecutionLimits", () => {
    it("should accept undefined", () => {
      expect(() => validateExecutionLimits(undefined)).not.toThrow();
    });

    it("should accept empty object", () => {
      expect(() => validateExecutionLimits({})).not.toThrow();
    });

    it("should accept valid full config", () => {
      const limits: ExecutionLimitsConfig = {
        maxIterations: 50,
        maxExecutionTimeMs: 60_000,
        loopDetection: {
          windowSize: 10,
          repeatThreshold: 5,
          maxCycleLength: 3,
          onDetected: "warn",
        },
      };
      expect(() => validateExecutionLimits(limits)).not.toThrow();
    });

    it("should reject non-object", () => {
      expect(() => validateExecutionLimits("bad" as unknown as ExecutionLimitsConfig)).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject maxIterations < 1", () => {
      expect(() => validateExecutionLimits({ maxIterations: 0 })).toThrow(TemplarConfigError);
      expect(() => validateExecutionLimits({ maxIterations: -1 })).toThrow(TemplarConfigError);
    });

    it("should reject non-number maxIterations", () => {
      expect(() =>
        validateExecutionLimits({ maxIterations: "10" } as unknown as ExecutionLimitsConfig),
      ).toThrow(TemplarConfigError);
    });

    it("should reject NaN maxIterations", () => {
      expect(() => validateExecutionLimits({ maxIterations: NaN })).toThrow(TemplarConfigError);
    });

    it("should reject Infinity maxIterations", () => {
      expect(() => validateExecutionLimits({ maxIterations: Infinity })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject fractional maxIterations", () => {
      expect(() => validateExecutionLimits({ maxIterations: 2.5 })).toThrow(TemplarConfigError);
    });

    it("should reject NaN maxExecutionTimeMs", () => {
      expect(() => validateExecutionLimits({ maxExecutionTimeMs: NaN })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject Infinity maxExecutionTimeMs", () => {
      expect(() => validateExecutionLimits({ maxExecutionTimeMs: Infinity })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject maxExecutionTimeMs < 0", () => {
      expect(() => validateExecutionLimits({ maxExecutionTimeMs: -1 })).toThrow(TemplarConfigError);
    });

    it("should accept maxExecutionTimeMs of 0", () => {
      expect(() => validateExecutionLimits({ maxExecutionTimeMs: 0 })).not.toThrow();
    });

    it("should reject loopDetection windowSize < 1", () => {
      expect(() => validateExecutionLimits({ loopDetection: { windowSize: 0 } })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject loopDetection repeatThreshold < 2", () => {
      expect(() => validateExecutionLimits({ loopDetection: { repeatThreshold: 1 } })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject loopDetection maxCycleLength < 1", () => {
      expect(() => validateExecutionLimits({ loopDetection: { maxCycleLength: 0 } })).toThrow(
        TemplarConfigError,
      );
    });

    it("should reject invalid loopDetection onDetected", () => {
      expect(() =>
        validateExecutionLimits({
          loopDetection: { onDetected: "panic" as "warn" },
        }),
      ).toThrow(TemplarConfigError);
    });

    it("should accept valid loopDetection onDetected values", () => {
      for (const val of ["warn", "stop", "error"] as const) {
        expect(() => validateExecutionLimits({ loopDetection: { onDetected: val } })).not.toThrow();
      }
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
