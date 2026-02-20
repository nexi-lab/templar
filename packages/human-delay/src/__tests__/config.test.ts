import { HumanDelayConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { validateHumanDelayConfig } from "../adapter.js";

describe("validateHumanDelayConfig", () => {
  it("accepts undefined config (all defaults)", () => {
    expect(() => validateHumanDelayConfig(undefined)).not.toThrow();
  });

  it("accepts valid config", () => {
    expect(() =>
      validateHumanDelayConfig({
        wpm: 60,
        jitterFactor: 0.3,
        minDelay: 200,
        maxDelay: 5000,
        typingRepeatMs: 3000,
      }),
    ).not.toThrow();
  });

  it("accepts empty object (all defaults)", () => {
    expect(() => validateHumanDelayConfig({})).not.toThrow();
  });

  it("throws for wpm=0", () => {
    expect(() => validateHumanDelayConfig({ wpm: 0 })).toThrow(HumanDelayConfigurationError);
  });

  it("throws for wpm=-1", () => {
    expect(() => validateHumanDelayConfig({ wpm: -1 })).toThrow(HumanDelayConfigurationError);
  });

  it("throws for wpm=NaN", () => {
    expect(() => validateHumanDelayConfig({ wpm: Number.NaN })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("throws for wpm=Infinity", () => {
    expect(() => validateHumanDelayConfig({ wpm: Number.POSITIVE_INFINITY })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("throws for jitterFactor=-0.1", () => {
    expect(() => validateHumanDelayConfig({ jitterFactor: -0.1 })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("throws for jitterFactor=1.1", () => {
    expect(() => validateHumanDelayConfig({ jitterFactor: 1.1 })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("accepts jitterFactor boundary values (0 and 1)", () => {
    expect(() => validateHumanDelayConfig({ jitterFactor: 0 })).not.toThrow();
    expect(() => validateHumanDelayConfig({ jitterFactor: 1 })).not.toThrow();
  });

  it("throws for minDelay=-1", () => {
    expect(() => validateHumanDelayConfig({ minDelay: -1 })).toThrow(HumanDelayConfigurationError);
  });

  it("throws for maxDelay=-1", () => {
    expect(() => validateHumanDelayConfig({ maxDelay: -1 })).toThrow(HumanDelayConfigurationError);
  });

  it("throws when minDelay > maxDelay", () => {
    expect(() => validateHumanDelayConfig({ minDelay: 5000, maxDelay: 1000 })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("throws for typingRepeatMs=50 (below 100ms minimum)", () => {
    expect(() => validateHumanDelayConfig({ typingRepeatMs: 50 })).toThrow(
      HumanDelayConfigurationError,
    );
  });

  it("accepts typingRepeatMs=100 (boundary)", () => {
    expect(() => validateHumanDelayConfig({ typingRepeatMs: 100 })).not.toThrow();
  });
});
