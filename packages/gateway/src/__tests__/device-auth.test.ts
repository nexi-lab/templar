import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { timingSafeTokenCompare, verifyDeviceJwt } from "../device-auth.js";

function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey };
}

async function signJwt(
  privateKey: KeyObject,
  nodeId: string,
  options?: { exp?: string },
): Promise<string> {
  let builder = new SignJWT({ sub: nodeId }).setProtectedHeader({ alg: "EdDSA" }).setIssuedAt();
  if (options?.exp) {
    builder = builder.setExpirationTime(options.exp);
  } else {
    builder = builder.setExpirationTime("5m");
  }
  return builder.sign(privateKey);
}

describe("verifyDeviceJwt", () => {
  it("verifies a valid JWT", async () => {
    const { privateKey, publicKey } = makeKeyPair();
    const jwt = await signJwt(privateKey, "node-1");

    const result = await verifyDeviceJwt(jwt, publicKey);
    expect(result.valid).toBe(true);
    expect(result.nodeId).toBe("node-1");
    expect(result.exp).toBeTypeOf("number");
  });

  it("rejects an expired JWT", async () => {
    const { privateKey, publicKey } = makeKeyPair();
    // Sign with 0 seconds expiration
    const jwt = await new SignJWT({ sub: "node-1" })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .sign(privateKey);

    const result = await verifyDeviceJwt(jwt, publicKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects a JWT signed with a different key", async () => {
    const attacker = makeKeyPair();
    const victim = makeKeyPair();
    const jwt = await signJwt(attacker.privateKey, "node-1");

    const result = await verifyDeviceJwt(jwt, victim.publicKey);
    expect(result.valid).toBe(false);
  });

  it("rejects a tampered JWT payload", async () => {
    const { privateKey, publicKey } = makeKeyPair();
    const jwt = await signJwt(privateKey, "node-1");

    // Tamper with the payload
    const [header, , sig] = jwt.split(".");
    const fakePayload = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
    const tampered = `${header}.${fakePayload}.${sig}`;

    const result = await verifyDeviceJwt(tampered, publicKey);
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed JWT", async () => {
    const { publicKey } = makeKeyPair();
    const result = await verifyDeviceJwt("not-a-jwt", publicKey);
    expect(result.valid).toBe(false);
  });

  it("rejects a JWT without sub claim", async () => {
    const { privateKey, publicKey } = makeKeyPair();
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await verifyDeviceJwt(jwt, publicKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sub");
  });
});

describe("timingSafeTokenCompare", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeTokenCompare("test-token-123", "test-token-123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeTokenCompare("test-token-aaa", "test-token-bbb")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeTokenCompare("short", "much-longer-string")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeTokenCompare("", "")).toBe(true);
  });

  it("handles unicode strings", () => {
    expect(timingSafeTokenCompare("héllo", "héllo")).toBe(true);
    expect(timingSafeTokenCompare("héllo", "hello")).toBe(false);
  });
});
