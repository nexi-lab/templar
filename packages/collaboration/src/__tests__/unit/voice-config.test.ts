import { CollaborationConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { resolveVoiceEvolutionConfig } from "../../voice/config.js";
import { DEFAULT_QUERY_TIMEOUT_MS } from "../../voice/constants.js";
import type { VoiceEvolutionConfig } from "../../voice/types.js";

function mockNexusClient(): VoiceEvolutionConfig["nexusClient"] {
  return {
    memory: {
      query: async () => ({ results: [], total: 0 }),
    },
  } as unknown as VoiceEvolutionConfig["nexusClient"];
}

function validConfig(overrides?: Partial<VoiceEvolutionConfig>): VoiceEvolutionConfig {
  return {
    nexusClient: mockNexusClient(),
    updateInterval: "1h",
    maxDrift: 0.2,
    ...overrides,
  };
}

describe("resolveVoiceEvolutionConfig", () => {
  it("should resolve valid config with defaults", () => {
    const resolved = resolveVoiceEvolutionConfig(validConfig());
    expect(resolved.updateIntervalMs).toBe(3_600_000);
    expect(resolved.maxDrift).toBe(0.2);
    expect(resolved.queryTimeoutMs).toBe(DEFAULT_QUERY_TIMEOUT_MS);
    expect(resolved.basePersonality).toBe("");
    expect(typeof resolved.modifierBuilder).toBe("function");
  });

  it("should throw when nexusClient is missing", () => {
    expect(() =>
      resolveVoiceEvolutionConfig({
        updateInterval: "1h",
        maxDrift: 0.2,
      } as VoiceEvolutionConfig),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should throw on invalid maxDrift (> 1)", () => {
    expect(() => resolveVoiceEvolutionConfig(validConfig({ maxDrift: 1.5 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid maxDrift (< 0)", () => {
    expect(() => resolveVoiceEvolutionConfig(validConfig({ maxDrift: -0.1 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid updateInterval", () => {
    expect(() => resolveVoiceEvolutionConfig(validConfig({ updateInterval: "invalid" }))).toThrow();
  });

  it("should throw on invalid queryTimeoutMs", () => {
    expect(() => resolveVoiceEvolutionConfig(validConfig({ queryTimeoutMs: -1 }))).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should accept maxDrift boundaries (0 and 1)", () => {
    expect(() => resolveVoiceEvolutionConfig(validConfig({ maxDrift: 0 }))).not.toThrow();
    expect(() => resolveVoiceEvolutionConfig(validConfig({ maxDrift: 1 }))).not.toThrow();
  });

  it("should use custom basePersonality", () => {
    const resolved = resolveVoiceEvolutionConfig(
      validConfig({ basePersonality: "You are a helpful assistant." }),
    );
    expect(resolved.basePersonality).toBe("You are a helpful assistant.");
  });
});
