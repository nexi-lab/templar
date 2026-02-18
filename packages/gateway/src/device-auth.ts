import type { KeyObject } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// JWT Verification
// ---------------------------------------------------------------------------

export interface DeviceJwtResult {
  readonly valid: boolean;
  readonly nodeId?: string | undefined;
  readonly exp?: number | undefined;
  readonly error?: string | undefined;
}

/**
 * Verify an Ed25519-signed device JWT against a public key.
 *
 * Returns a result object indicating validity, the nodeId from the `sub` claim,
 * and the expiration time.
 */
export async function verifyDeviceJwt(
  signature: string,
  publicKey: KeyObject,
): Promise<DeviceJwtResult> {
  try {
    const { payload } = await jwtVerify(signature, publicKey, {
      algorithms: ["EdDSA"],
    });
    const nodeId = payload.sub;
    if (!nodeId) {
      return { valid: false, error: "Missing 'sub' claim in JWT" };
    }
    return {
      valid: true,
      nodeId,
      exp: payload.exp,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish expired vs other errors
    if (message.includes("exp") || message.includes("expired")) {
      return { valid: false, error: "JWT expired" };
    }
    return { valid: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Timing-Safe Token Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two strings in constant time to prevent timing attacks.
 *
 * Handles different-length strings safely by comparing against
 * a fixed-length hash-like buffer.
 */
export function timingSafeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");

  if (bufA.length !== bufB.length) {
    // Compare bufA against itself to maintain constant time,
    // then return false (different lengths are never equal)
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
