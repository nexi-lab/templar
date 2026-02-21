import { describe, expect, it } from "vitest";
import { CollaborationConfigurationError, ReactionPatternInvalidError } from "@templar/errors";
import { resolveReactionConfig } from "../../reaction/config.js";
import type { ReactionConfig } from "../../reaction/types.js";
import { DEFAULT_POLL_INTERVAL_MS } from "../../reaction/constants.js";

function validConfig(overrides?: Partial<ReactionConfig>): ReactionConfig {
  return {
    patterns: [
      {
        event: "nexus.file.*",
        probability: 0.8,
        cooldown: "10m",
        action: "review_document",
      },
    ],
    ...overrides,
  };
}

describe("resolveReactionConfig", () => {
  it("should resolve valid config with defaults", () => {
    const resolved = resolveReactionConfig(validConfig());
    expect(resolved.patterns).toHaveLength(1);
    expect(resolved.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(typeof resolved.rng).toBe("function");
    expect(typeof resolved.onReaction).toBe("function");
  });

  it("should throw on empty patterns", () => {
    expect(() => resolveReactionConfig({ patterns: [] })).toThrow(
      CollaborationConfigurationError,
    );
  });

  it("should throw on invalid probability (< 0)", () => {
    expect(() =>
      resolveReactionConfig(
        validConfig({
          patterns: [
            { event: "nexus.*", probability: -0.1, cooldown: "1m", action: "test" },
          ],
        }),
      ),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should throw on invalid probability (> 1)", () => {
    expect(() =>
      resolveReactionConfig(
        validConfig({
          patterns: [
            { event: "nexus.*", probability: 1.5, cooldown: "1m", action: "test" },
          ],
        }),
      ),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should throw on invalid cooldown format", () => {
    expect(() =>
      resolveReactionConfig(
        validConfig({
          patterns: [
            { event: "nexus.*", probability: 0.5, cooldown: "invalid", action: "test" },
          ],
        }),
      ),
    ).toThrow();
  });

  it("should throw on empty action", () => {
    expect(() =>
      resolveReactionConfig(
        validConfig({
          patterns: [
            { event: "nexus.*", probability: 0.5, cooldown: "1m", action: "" },
          ],
        }),
      ),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should throw on invalid pollIntervalMs", () => {
    expect(() =>
      resolveReactionConfig(validConfig({ pollIntervalMs: -1 })),
    ).toThrow(CollaborationConfigurationError);

    expect(() =>
      resolveReactionConfig(validConfig({ pollIntervalMs: 0 })),
    ).toThrow(CollaborationConfigurationError);
  });

  it("should use custom clock and rng", () => {
    const clock = {
      now: () => 1000,
      setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) =>
        globalThis.clearTimeout(id),
    };
    const rng = () => 0.42;

    const resolved = resolveReactionConfig(validConfig({ clock, rng }));
    expect(resolved.clock.now()).toBe(1000);
    expect(resolved.rng()).toBe(0.42);
  });

  it("should accept probability boundaries (0 and 1)", () => {
    const config0 = validConfig({
      patterns: [{ event: "nexus.*", probability: 0, cooldown: "1m", action: "test" }],
    });
    const config1 = validConfig({
      patterns: [{ event: "nexus.*", probability: 1, cooldown: "1m", action: "test" }],
    });

    expect(() => resolveReactionConfig(config0)).not.toThrow();
    expect(() => resolveReactionConfig(config1)).not.toThrow();
  });
});
