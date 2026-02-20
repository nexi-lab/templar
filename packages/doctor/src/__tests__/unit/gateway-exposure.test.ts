import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GatewayExposureCheck } from "../../checks/gateway-exposure.js";

describe("GatewayExposureCheck", () => {
  const check = new GatewayExposureCheck();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-gw-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects legacy auth mode", async () => {
    await fs.writeFile(
      path.join(tmpDir, "gateway.yaml"),
      `authMode: legacy\nbind: 127.0.0.1:8080\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "GW-001")).toBe(true);
  });

  it("detects wildcard bind without TLS", async () => {
    await fs.writeFile(
      path.join(tmpDir, "gateway.yaml"),
      `authMode: device-key\nbind: 0.0.0.0:8080\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "GW-002")).toBe(true);
    expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects TOFU enabled", async () => {
    await fs.writeFile(
      path.join(tmpDir, "gateway.yaml"),
      `authMode: device-key\nbind: 127.0.0.1:8080\ntofu: true\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "GW-003")).toBe(true);
  });

  it("detects exposed API key in config", async () => {
    await fs.writeFile(
      path.join(tmpDir, "gateway.yaml"),
      `authMode: device-key\nbind: 127.0.0.1:8080\napiKey: sk-real-key-123\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(result.findings.some((f) => f.id === "GW-004")).toBe(true);
  });

  it("passes with a clean configuration", async () => {
    await fs.writeFile(
      path.join(tmpDir, "gateway.yaml"),
      `authMode: device-key\nbind: 127.0.0.1:8080\ntls:\n  cert: cert.pem\n  key: key.pem\nrateLimit:\n  maxPerMinute: 100\n`,
    );

    const result = await check.run({ workspace: tmpDir });
    expect(
      result.findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH"),
    ).toHaveLength(0);
  });
});
