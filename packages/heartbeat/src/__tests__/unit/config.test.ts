import { HeartbeatConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { resolveHeartbeatConfig } from "../../config.js";
import {
  DEFAULT_DIAGNOSTICS_BUFFER_SIZE,
  DEFAULT_EVALUATOR_TIMEOUT_MS,
  DEFAULT_INTERVAL_MS,
} from "../../constants.js";

describe("resolveHeartbeatConfig", () => {
  it("should resolve with all defaults when given empty config", () => {
    const config = resolveHeartbeatConfig({});
    expect(config.intervalMs).toBe(DEFAULT_INTERVAL_MS);
    expect(config.evaluatorTimeoutMs).toBe(DEFAULT_EVALUATOR_TIMEOUT_MS);
    expect(config.diagnosticsBufferSize).toBe(DEFAULT_DIAGNOSTICS_BUFFER_SIZE);
    expect(config.evaluators).toEqual([]);
    expect(config.clock).toBeDefined();
  });

  it("should resolve with all defaults when given no config", () => {
    const config = resolveHeartbeatConfig();
    expect(config.intervalMs).toBe(DEFAULT_INTERVAL_MS);
  });

  it("should accept valid intervalMs", () => {
    const config = resolveHeartbeatConfig({ intervalMs: 60_000 });
    expect(config.intervalMs).toBe(60_000);
  });

  it("should throw on intervalMs <= 0", () => {
    expect(() => resolveHeartbeatConfig({ intervalMs: 0 })).toThrow(HeartbeatConfigurationError);
    expect(() => resolveHeartbeatConfig({ intervalMs: -1 })).toThrow(HeartbeatConfigurationError);
  });

  it("should throw on non-finite intervalMs", () => {
    expect(() => resolveHeartbeatConfig({ intervalMs: Number.NaN })).toThrow(
      HeartbeatConfigurationError,
    );
    expect(() => resolveHeartbeatConfig({ intervalMs: Number.POSITIVE_INFINITY })).toThrow(
      HeartbeatConfigurationError,
    );
  });

  it("should accept valid evaluatorTimeoutMs", () => {
    const config = resolveHeartbeatConfig({ evaluatorTimeoutMs: 5000 });
    expect(config.evaluatorTimeoutMs).toBe(5000);
  });

  it("should throw on evaluatorTimeoutMs <= 0", () => {
    expect(() => resolveHeartbeatConfig({ evaluatorTimeoutMs: 0 })).toThrow(
      HeartbeatConfigurationError,
    );
  });

  it("should accept valid diagnosticsBufferSize", () => {
    const config = resolveHeartbeatConfig({ diagnosticsBufferSize: 50 });
    expect(config.diagnosticsBufferSize).toBe(50);
  });

  it("should throw on diagnosticsBufferSize <= 0", () => {
    expect(() => resolveHeartbeatConfig({ diagnosticsBufferSize: 0 })).toThrow(
      HeartbeatConfigurationError,
    );
  });

  it("should throw on non-integer diagnosticsBufferSize", () => {
    expect(() => resolveHeartbeatConfig({ diagnosticsBufferSize: 3.5 })).toThrow(
      HeartbeatConfigurationError,
    );
  });

  it("should pass through nexusClient when provided", () => {
    const mockClient = {} as never;
    const config = resolveHeartbeatConfig({ nexusClient: mockClient });
    expect(config.nexusClient).toBe(mockClient);
  });

  it("should not include nexusClient when not provided", () => {
    const config = resolveHeartbeatConfig({});
    expect("nexusClient" in config).toBe(false);
  });

  it("should pass through onTick callback", () => {
    const onTick = () => {};
    const config = resolveHeartbeatConfig({ onTick });
    expect(config.onTick).toBe(onTick);
  });

  it("should accept custom clock", () => {
    const clock = {
      now: () => 0,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };
    const config = resolveHeartbeatConfig({ clock });
    expect(config.clock).toBe(clock);
  });
});
