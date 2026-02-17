import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { SignJWT } from "jose";
import type { KeyProvider } from "./types.js";

// ---------------------------------------------------------------------------
// Key Generation
// ---------------------------------------------------------------------------

export interface KeyPair {
  readonly privateKey: string;
  readonly publicKey: string;
}

/**
 * Generate a new Ed25519 key pair and return PEM-encoded strings.
 */
export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKey: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

/**
 * Load an existing Ed25519 key pair from disk, or generate and persist one.
 * Sets file permissions to 0o600 (owner read/write only).
 */
export function loadOrCreateKeyPair(keyPath: string): KeyPair {
  try {
    const pem = readFileSync(keyPath, "utf-8");
    const privateKey = createPrivateKey(pem);
    const publicKey = createPublicKey(privateKey);
    return {
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      publicKey: publicKey.export({ type: "spki", format: "pem" }) as string,
    };
  } catch {
    const pair = generateKeyPair();
    writeFileSync(keyPath, pair.privateKey, { mode: 0o600 });
    return pair;
  }
}

// ---------------------------------------------------------------------------
// Key Provider Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a KeyProvider into a concrete key pair.
 */
export async function resolveKeyPair(
  provider: KeyProvider,
): Promise<{ readonly privateKey: string; readonly publicKey: string }> {
  if (typeof provider === "function") {
    return provider();
  }
  return provider;
}

// ---------------------------------------------------------------------------
// JWT Signing
// ---------------------------------------------------------------------------

/**
 * Create an Ed25519-signed JWT for device authentication.
 *
 * Claims:
 * - sub: nodeId
 * - iat: current time
 * - exp: current time + 5 minutes
 */
export async function createDeviceJwt(privateKeyPem: string, nodeId: string): Promise<string> {
  const privateKey = createPrivateKey(privateKeyPem);
  return new SignJWT({ sub: nodeId })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

// ---------------------------------------------------------------------------
// Public Key Export
// ---------------------------------------------------------------------------

/**
 * Export a PEM-encoded Ed25519 public key as a base64url-encoded raw key (32 bytes).
 * This is the compact form used in the register frame's `publicKey` field.
 */
export function exportPublicKeyBase64url(publicKeyPem: string): string {
  const keyObject = createPublicKey(publicKeyPem);
  // Export as DER/SPKI, then strip the 12-byte OID prefix to get raw 32 bytes
  const der = keyObject.export({ type: "spki", format: "der" });
  const raw = (der as Buffer).subarray(12); // Ed25519 SPKI DER has 12-byte prefix
  return raw.toString("base64url");
}
