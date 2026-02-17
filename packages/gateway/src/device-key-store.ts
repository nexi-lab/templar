import { createPublicKey, type KeyObject } from "node:crypto";

// ---------------------------------------------------------------------------
// DeviceKeyStore Interface
// ---------------------------------------------------------------------------

export interface DeviceKeyStore {
  get(nodeId: string): KeyObject | undefined;
  set(nodeId: string, key: KeyObject): void;
  has(nodeId: string): boolean;
  delete(nodeId: string): boolean;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// InMemoryDeviceKeyStore
// ---------------------------------------------------------------------------

interface StoredKey {
  readonly key: KeyObject;
  lastUsed: number;
}

export interface InMemoryDeviceKeyStoreOptions {
  readonly maxKeys?: number;
}

/**
 * In-memory device key store with LRU eviction.
 *
 * Stores Ed25519 public keys keyed by nodeId.
 * When the store reaches maxKeys, the least-recently-used entry is evicted.
 */
export class InMemoryDeviceKeyStore implements DeviceKeyStore {
  private readonly keys = new Map<string, StoredKey>();
  private readonly maxKeys: number;

  constructor(options: InMemoryDeviceKeyStoreOptions = {}) {
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  get(nodeId: string): KeyObject | undefined {
    const entry = this.keys.get(nodeId);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.key;
    }
    return undefined;
  }

  set(nodeId: string, key: KeyObject): void {
    // Update existing entry
    const existing = this.keys.get(nodeId);
    if (existing) {
      // Replace with new key + updated timestamp (immutable key object)
      this.keys.set(nodeId, { key, lastUsed: Date.now() });
      return;
    }

    // Evict LRU if at capacity
    if (this.keys.size >= this.maxKeys) {
      this.evictLru();
    }

    this.keys.set(nodeId, { key, lastUsed: Date.now() });
  }

  has(nodeId: string): boolean {
    return this.keys.has(nodeId);
  }

  delete(nodeId: string): boolean {
    return this.keys.delete(nodeId);
  }

  get size(): number {
    return this.keys.size;
  }

  /**
   * Bulk-load known keys from config.
   * Each entry is a { nodeId, publicKey } where publicKey is a base64url-encoded
   * raw Ed25519 public key (32 bytes).
   */
  loadFromConfig(
    knownKeys: readonly { readonly nodeId: string; readonly publicKey: string }[],
  ): void {
    for (const { nodeId, publicKey } of knownKeys) {
      const keyObject = importBase64urlPublicKey(publicKey);
      this.keys.set(nodeId, { key: keyObject, lastUsed: Date.now() });
    }
  }

  private evictLru(): void {
    let oldestId: string | undefined;
    let oldestTime = Infinity;
    for (const [id, entry] of this.keys) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId !== undefined) {
      this.keys.delete(oldestId);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Import a base64url-encoded raw Ed25519 public key (32 bytes) into a KeyObject.
 */
export function importBase64urlPublicKey(base64url: string): KeyObject {
  const raw = Buffer.from(base64url, "base64url");
  // Ed25519 public key in DER format: 12-byte OID prefix + 32-byte raw key
  const ed25519OidPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([ed25519OidPrefix, raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}
