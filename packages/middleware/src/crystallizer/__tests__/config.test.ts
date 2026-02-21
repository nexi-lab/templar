/**
 * Crystallizer config validation tests (#164)
 */

import { CrystallizerConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { validateCrystallizerConfig } from "../middleware.js";
import type { CrystallizerConfig } from "../types.js";

describe("validateCrystallizerConfig", () => {
  it("1. default config accepted", () => {
    expect(() => validateCrystallizerConfig({})).not.toThrow();
  });

  it("2. minUses < 1 → error", () => {
    expect(() => validateCrystallizerConfig({ minUses: 0 })).toThrow(
      CrystallizerConfigurationError,
    );
    expect(() => validateCrystallizerConfig({ minUses: -1 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("3. minSuccessRate > 1 → error", () => {
    expect(() => validateCrystallizerConfig({ minSuccessRate: 1.1 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("4. minSuccessRate < 0 → error", () => {
    expect(() => validateCrystallizerConfig({ minSuccessRate: -0.1 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("5. minPatternLength < 1 → error", () => {
    expect(() => validateCrystallizerConfig({ minPatternLength: 0 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("6. maxPatternLength < minPatternLength → error", () => {
    expect(() => validateCrystallizerConfig({ minPatternLength: 5, maxPatternLength: 3 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("7. maxLoadedSequences > 10000 → error", () => {
    expect(() => validateCrystallizerConfig({ maxLoadedSequences: 10001 })).toThrow(
      CrystallizerConfigurationError,
    );
  });

  it("8. multiple validation errors collected", () => {
    try {
      validateCrystallizerConfig({
        minUses: 0,
        minSuccessRate: 2,
        minPatternLength: 0,
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CrystallizerConfigurationError);
      const error = err as CrystallizerConfigurationError;
      expect(error.validationErrors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("9. valid custom config accepted", () => {
    const config: CrystallizerConfig = {
      minUses: 3,
      minSuccessRate: 0.8,
      minPatternLength: 2,
      maxPatternLength: 8,
      autoApprove: true,
      maxLoadedSequences: 200,
      scope: "zone",
      namespace: "custom",
      sessionStartTimeoutMs: 5000,
      storeTimeoutMs: 10000,
      tags: ["custom-tag"],
      enabled: {
        observation: true,
        mining: true,
        crystallization: false,
        validation: true,
      },
    };
    expect(() => validateCrystallizerConfig(config)).not.toThrow();
  });

  it("10. partial config merged with defaults correctly", () => {
    // This tests that we don't throw on partial configs
    // (the resolveConfig merges with defaults, validated in middleware constructor)
    expect(() => validateCrystallizerConfig({ minUses: 3 })).not.toThrow();
    expect(() => validateCrystallizerConfig({ tags: ["a"] })).not.toThrow();
    expect(() => validateCrystallizerConfig({ enabled: { observation: false } })).not.toThrow();
  });
});
