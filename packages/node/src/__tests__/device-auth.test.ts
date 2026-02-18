import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDeviceJwt,
  exportPublicKeyBase64url,
  generateKeyPair,
  loadOrCreateKeyPair,
  resolveKeyPair,
} from "../device-auth.js";

describe("generateKeyPair", () => {
  it("returns valid PEM-encoded Ed25519 keys", () => {
    const pair = generateKeyPair();
    expect(pair.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(pair.publicKey).toContain("BEGIN PUBLIC KEY");

    // Verify they can be loaded
    const privKey = createPrivateKey(pair.privateKey);
    const pubKey = createPublicKey(pair.publicKey);
    expect(privKey.asymmetricKeyType).toBe("ed25519");
    expect(pubKey.asymmetricKeyType).toBe("ed25519");
  });

  it("generates unique key pairs", () => {
    const pair1 = generateKeyPair();
    const pair2 = generateKeyPair();
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
  });
});

describe("loadOrCreateKeyPair", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `device-auth-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("generates and saves a key pair on first call", () => {
    const keyPath = join(testDir, "device.key");
    const pair = loadOrCreateKeyPair(keyPath);

    expect(pair.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(pair.publicKey).toContain("BEGIN PUBLIC KEY");

    // File should exist
    const content = readFileSync(keyPath, "utf-8");
    expect(content).toContain("BEGIN PRIVATE KEY");
  });

  it("sets file permissions to 0o600", () => {
    const keyPath = join(testDir, "device.key");
    loadOrCreateKeyPair(keyPath);

    const stats = statSync(keyPath);
    // On macOS/Linux, check owner-only permissions (0o600 = 384)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("loads existing key on second call", () => {
    const keyPath = join(testDir, "device.key");
    const pair1 = loadOrCreateKeyPair(keyPath);
    const pair2 = loadOrCreateKeyPair(keyPath);

    // Same key pair both times
    expect(pair1.publicKey).toBe(pair2.publicKey);
  });
});

describe("resolveKeyPair", () => {
  it("resolves from static object", async () => {
    const pair = generateKeyPair();
    const resolved = await resolveKeyPair(pair);
    expect(resolved.privateKey).toBe(pair.privateKey);
    expect(resolved.publicKey).toBe(pair.publicKey);
  });

  it("resolves from sync factory function", async () => {
    const pair = generateKeyPair();
    const resolved = await resolveKeyPair(() => pair);
    expect(resolved.privateKey).toBe(pair.privateKey);
  });

  it("resolves from async factory function", async () => {
    const pair = generateKeyPair();
    const resolved = await resolveKeyPair(async () => pair);
    expect(resolved.privateKey).toBe(pair.privateKey);
  });
});

describe("createDeviceJwt", () => {
  it("produces a valid JWT with correct claims", async () => {
    const pair = generateKeyPair();
    const jwt = await createDeviceJwt(pair.privateKey, "node-42");

    // Verify with jose
    const pubKey = createPublicKey(pair.publicKey);
    const { payload } = await jwtVerify(jwt, pubKey, { algorithms: ["EdDSA"] });

    expect(payload.sub).toBe("node-42");
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
  });

  it("sets expiration to approximately 5 minutes from now", async () => {
    const pair = generateKeyPair();
    const jwt = await createDeviceJwt(pair.privateKey, "node-1");

    const pubKey = createPublicKey(pair.publicKey);
    const { payload } = await jwtVerify(jwt, pubKey, { algorithms: ["EdDSA"] });

    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + 300; // 5 minutes
    // Allow 5 second tolerance
    expect(Math.abs((payload.exp ?? 0) - expectedExp)).toBeLessThan(5);
  });

  it("uses EdDSA algorithm", async () => {
    const pair = generateKeyPair();
    const jwt = await createDeviceJwt(pair.privateKey, "node-1");

    // Parse header
    const headerB64 = jwt.split(".")[0] as string;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    expect(header.alg).toBe("EdDSA");
  });
});

describe("exportPublicKeyBase64url", () => {
  it("exports a 32-byte raw Ed25519 public key as base64url", () => {
    const pair = generateKeyPair();
    const b64url = exportPublicKeyBase64url(pair.publicKey);

    // Ed25519 public key is 32 bytes = 43 base64url characters (no padding)
    const raw = Buffer.from(b64url, "base64url");
    expect(raw.length).toBe(32);
  });

  it("round-trips through import", () => {
    const pair = generateKeyPair();
    const b64url = exportPublicKeyBase64url(pair.publicKey);

    // Use gateway's importBase64urlPublicKey equivalent
    const raw = Buffer.from(b64url, "base64url");
    const ed25519OidPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const der = Buffer.concat([ed25519OidPrefix, raw]);
    const imported = createPublicKey({ key: der, format: "der", type: "spki" });

    const originalDer = createPublicKey(pair.publicKey).export({
      type: "spki",
      format: "der",
    });
    const importedDer = imported.export({ type: "spki", format: "der" });
    expect(Buffer.compare(originalDer as Buffer, importedDer as Buffer)).toBe(0);
  });
});
