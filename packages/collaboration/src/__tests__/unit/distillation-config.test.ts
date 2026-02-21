import { CollaborationConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { resolveDistillationConfig } from "../../distillation/config.js";
import { DEFAULT_MAX_TURNS, DEFAULT_MIN_CONFIDENCE } from "../../distillation/constants.js";
import type { DistillationConfig } from "../../distillation/types.js";

function mockNexusClient(): DistillationConfig["nexusClient"] {
  return {
    memory: {
      batchStore: async () => ({ stored: 0, failed: 0 }),
    },
  } as unknown as DistillationConfig["nexusClient"];
}

function validConfig(overrides?: Partial<DistillationConfig>): DistillationConfig {
  return {
    nexusClient: mockNexusClient(),
    ...overrides,
  };
}

describe("resolveDistillationConfig", () => {
  it("should resolve valid config with defaults", () => {
    const resolved = resolveDistillationConfig(validConfig());
    expect(resolved.maxTurns).toBe(DEFAULT_MAX_TURNS);
    expect(resolved.minConfidence).toBe(DEFAULT_MIN_CONFIDENCE);
    expect(resolved.triggers).toEqual(["session_end"]);
    expect(resolved.scope).toBe("agent");
  });

  it("should throw when nexusClient is missing", () => {
    expect(() => resolveDistillationConfig({} as DistillationConfig)).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid maxTurns", () => {
    expect(() => resolveDistillationConfig(validConfig({ maxTurns: 0 }))).toThrow(
      CollaborationConfigurationError,
    );
    expect(() => resolveDistillationConfig(validConfig({ maxTurns: -1 }))).toThrow(
      CollaborationConfigurationError,
    );
    expect(() => resolveDistillationConfig(validConfig({ maxTurns: 1.5 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid extractionTimeoutMs", () => {
    expect(() => resolveDistillationConfig(validConfig({ extractionTimeoutMs: -1 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid minConfidence", () => {
    expect(() => resolveDistillationConfig(validConfig({ minConfidence: -0.1 }))).toThrow(
      CollaborationConfigurationError,
    );
    expect(() => resolveDistillationConfig(validConfig({ minConfidence: 1.5 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid trigger", () => {
    expect(() =>
      resolveDistillationConfig(validConfig({ triggers: ["invalid_trigger" as "session_end"] })),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should accept custom triggers", () => {
    const resolved = resolveDistillationConfig(
      validConfig({ triggers: ["session_end", "context_compact"] }),
    );
    expect(resolved.triggers).toEqual(["session_end", "context_compact"]);
  });

  it("should accept boundary values for minConfidence", () => {
    expect(() => resolveDistillationConfig(validConfig({ minConfidence: 0 }))).not.toThrow();
    expect(() => resolveDistillationConfig(validConfig({ minConfidence: 1 }))).not.toThrow();
  });
});
