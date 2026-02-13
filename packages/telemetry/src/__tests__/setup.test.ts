import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isTelemetryEnabled, setupTelemetry, shutdownTelemetry } from "../setup.js";

describe("isTelemetryEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return false when OTEL_ENABLED is not set", () => {
    delete process.env.OTEL_ENABLED;
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('should return true when OTEL_ENABLED is "true"', () => {
    process.env.OTEL_ENABLED = "true";
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('should return true when OTEL_ENABLED is "1"', () => {
    process.env.OTEL_ENABLED = "1";
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('should return false when OTEL_ENABLED is "false"', () => {
    process.env.OTEL_ENABLED = "false";
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("should return false when OTEL_ENABLED is empty string", () => {
    process.env.OTEL_ENABLED = "";
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('should return false when OTEL_ENABLED is "0"', () => {
    process.env.OTEL_ENABLED = "0";
    expect(isTelemetryEnabled()).toBe(false);
  });
});

describe("setupTelemetry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await shutdownTelemetry();
    process.env = originalEnv;
  });

  it("should return false when OTEL_ENABLED is not set", async () => {
    delete process.env.OTEL_ENABLED;
    const result = await setupTelemetry();
    expect(result).toBe(false);
  });

  it("should return true when OTEL_ENABLED=true", async () => {
    process.env.OTEL_ENABLED = "true";
    const result = await setupTelemetry({ endpoint: "http://localhost:4318" });
    expect(result).toBe(true);
  });

  it("should return false on second call (idempotent)", async () => {
    process.env.OTEL_ENABLED = "true";
    const first = await setupTelemetry({ endpoint: "http://localhost:4318" });
    const second = await setupTelemetry({ endpoint: "http://localhost:4318" });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("should respect config overrides", async () => {
    process.env.OTEL_ENABLED = "true";
    const result = await setupTelemetry({
      serviceName: "test-service",
      endpoint: "http://localhost:9999",
      sampleRatio: 0.5,
      environment: "test",
    });
    expect(result).toBe(true);
  });
});

describe("shutdownTelemetry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await shutdownTelemetry();
    process.env = originalEnv;
  });

  it("should be safe to call when not initialized", async () => {
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  it("should allow re-initialization after shutdown", async () => {
    process.env.OTEL_ENABLED = "true";
    const first = await setupTelemetry({ endpoint: "http://localhost:4318" });
    expect(first).toBe(true);

    await shutdownTelemetry();

    const second = await setupTelemetry({ endpoint: "http://localhost:4318" });
    expect(second).toBe(true);
  });
});
