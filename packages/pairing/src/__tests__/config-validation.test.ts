import { PairingConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { validatePairingConfig } from "../types.js";

describe("validatePairingConfig", () => {
  it("valid config passes", () => {
    expect(() =>
      validatePairingConfig({
        enabled: true,
        codeLength: 8,
        expiryMs: 300_000,
        maxAttempts: 3,
        maxPendingCodes: 1000,
        channels: ["whatsapp"],
      }),
    ).not.toThrow();
  });

  it("undefined config passes (no-op)", () => {
    expect(() => validatePairingConfig(undefined)).not.toThrow();
  });

  it("negative expiryMs throws PairingConfigurationError", () => {
    expect(() => validatePairingConfig({ expiryMs: -100 })).toThrow(PairingConfigurationError);
  });

  it("codeLength < 4 throws PairingConfigurationError", () => {
    expect(() => validatePairingConfig({ codeLength: 3 })).toThrow(PairingConfigurationError);
  });

  it("zero maxAttempts throws PairingConfigurationError", () => {
    expect(() => validatePairingConfig({ maxAttempts: 0 })).toThrow(PairingConfigurationError);
  });

  it("zero maxPendingCodes throws PairingConfigurationError", () => {
    expect(() => validatePairingConfig({ maxPendingCodes: 0 })).toThrow(PairingConfigurationError);
  });

  it("empty channels array is valid", () => {
    expect(() => validatePairingConfig({ channels: [] })).not.toThrow();
  });
});
