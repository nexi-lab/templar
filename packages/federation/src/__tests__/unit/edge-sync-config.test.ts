import { FederationConfigurationInvalidError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { resolveEdgeSyncConfig } from "../../sync/config.js";
import { DEFAULT_EDGE_SYNC_CONFIG } from "../../sync/constants.js";

describe("resolveEdgeSyncConfig", () => {
  it("returns defaults when no overrides provided", () => {
    const config = resolveEdgeSyncConfig();
    expect(config).toEqual(DEFAULT_EDGE_SYNC_CONFIG);
  });

  it("returns defaults for undefined arg", () => {
    const config = resolveEdgeSyncConfig(undefined);
    expect(config).toEqual(DEFAULT_EDGE_SYNC_CONFIG);
  });

  it("merges partial overrides", () => {
    const config = resolveEdgeSyncConfig({ maxReconnectAttempts: 5 });
    expect(config.maxReconnectAttempts).toBe(5);
    expect(config.reconnectBaseDelayMs).toBe(DEFAULT_EDGE_SYNC_CONFIG.reconnectBaseDelayMs);
  });

  it("allows overriding all fields", () => {
    const overrides = {
      maxReconnectAttempts: 20,
      reconnectBaseDelayMs: 2_000,
      reconnectMaxDelayMs: 60_000,
      authRefreshTimeoutMs: 20_000,
      conflictScanTimeoutMs: 30_000,
      walReplayTimeoutMs: 60_000,
    };
    const config = resolveEdgeSyncConfig(overrides);
    expect(config).toEqual(overrides);
  });

  it("throws on zero value", () => {
    expect(() => resolveEdgeSyncConfig({ maxReconnectAttempts: 0 })).toThrow(
      FederationConfigurationInvalidError,
    );
  });

  it("throws on negative value", () => {
    expect(() => resolveEdgeSyncConfig({ reconnectBaseDelayMs: -100 })).toThrow(
      FederationConfigurationInvalidError,
    );
  });

  it("throws on Infinity", () => {
    expect(() => resolveEdgeSyncConfig({ reconnectMaxDelayMs: Number.POSITIVE_INFINITY })).toThrow(
      FederationConfigurationInvalidError,
    );
  });

  it("throws on NaN", () => {
    expect(() => resolveEdgeSyncConfig({ authRefreshTimeoutMs: Number.NaN })).toThrow(
      FederationConfigurationInvalidError,
    );
  });
});
