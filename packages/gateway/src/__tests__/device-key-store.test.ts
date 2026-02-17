import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryDeviceKeyStore, importBase64urlPublicKey } from "../device-key-store.js";

function makeTestKeyPair() {
  const { publicKey } = generateKeyPairSync("ed25519");
  return publicKey;
}

function exportBase64url(key: KeyObject): string {
  const der = key.export({ type: "spki", format: "der" }) as Buffer;
  return der.subarray(12).toString("base64url");
}

describe("InMemoryDeviceKeyStore", () => {
  // -------------------------------------------------------------------------
  // Basic CRUD
  // -------------------------------------------------------------------------

  it("stores and retrieves a key", () => {
    const store = new InMemoryDeviceKeyStore();
    const key = makeTestKeyPair();
    store.set("node-1", key);
    expect(store.get("node-1")).toBe(key);
  });

  it("returns undefined for unknown nodeId", () => {
    const store = new InMemoryDeviceKeyStore();
    expect(store.get("unknown")).toBeUndefined();
  });

  it("has() returns true for stored keys", () => {
    const store = new InMemoryDeviceKeyStore();
    const key = makeTestKeyPair();
    store.set("node-1", key);
    expect(store.has("node-1")).toBe(true);
    expect(store.has("node-2")).toBe(false);
  });

  it("delete() removes a key", () => {
    const store = new InMemoryDeviceKeyStore();
    const key = makeTestKeyPair();
    store.set("node-1", key);
    expect(store.delete("node-1")).toBe(true);
    expect(store.has("node-1")).toBe(false);
    expect(store.size).toBe(0);
  });

  it("delete() returns false for unknown key", () => {
    const store = new InMemoryDeviceKeyStore();
    expect(store.delete("unknown")).toBe(false);
  });

  it("tracks size correctly", () => {
    const store = new InMemoryDeviceKeyStore();
    expect(store.size).toBe(0);
    store.set("node-1", makeTestKeyPair());
    expect(store.size).toBe(1);
    store.set("node-2", makeTestKeyPair());
    expect(store.size).toBe(2);
    store.delete("node-1");
    expect(store.size).toBe(1);
  });

  it("overwrites existing key for same nodeId", () => {
    const store = new InMemoryDeviceKeyStore();
    const key1 = makeTestKeyPair();
    const key2 = makeTestKeyPair();
    store.set("node-1", key1);
    store.set("node-1", key2);
    expect(store.get("node-1")).toBe(key2);
    expect(store.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // LRU Eviction
  // -------------------------------------------------------------------------

  it("evicts least-recently-used entry when maxKeys is exceeded", () => {
    const store = new InMemoryDeviceKeyStore({ maxKeys: 2 });
    store.set("node-1", makeTestKeyPair());
    store.set("node-2", makeTestKeyPair());

    // node-1 is LRU, should be evicted when node-3 is added
    store.set("node-3", makeTestKeyPair());
    expect(store.has("node-1")).toBe(false);
    expect(store.has("node-2")).toBe(true);
    expect(store.has("node-3")).toBe(true);
    expect(store.size).toBe(2);
  });

  it("updates lastUsed on get()", async () => {
    const store = new InMemoryDeviceKeyStore({ maxKeys: 2 });
    store.set("node-1", makeTestKeyPair());
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    store.set("node-2", makeTestKeyPair());

    // Small delay, then access node-1 to make it most recently used
    await new Promise((r) => setTimeout(r, 5));
    store.get("node-1");

    // Now node-2 is LRU and should be evicted
    store.set("node-3", makeTestKeyPair());
    expect(store.has("node-1")).toBe(true);
    expect(store.has("node-2")).toBe(false);
    expect(store.has("node-3")).toBe(true);
  });

  it("does not evict when overwriting an existing key", () => {
    const store = new InMemoryDeviceKeyStore({ maxKeys: 2 });
    store.set("node-1", makeTestKeyPair());
    store.set("node-2", makeTestKeyPair());

    // Overwriting node-1 should not cause eviction
    store.set("node-1", makeTestKeyPair());
    expect(store.size).toBe(2);
    expect(store.has("node-1")).toBe(true);
    expect(store.has("node-2")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // loadFromConfig
  // -------------------------------------------------------------------------

  it("bulk loads keys from config", () => {
    const store = new InMemoryDeviceKeyStore();
    const key1 = makeTestKeyPair();
    const key2 = makeTestKeyPair();
    const knownKeys = [
      { nodeId: "node-1", publicKey: exportBase64url(key1) },
      { nodeId: "node-2", publicKey: exportBase64url(key2) },
    ];
    store.loadFromConfig(knownKeys);
    expect(store.size).toBe(2);
    expect(store.has("node-1")).toBe(true);
    expect(store.has("node-2")).toBe(true);
  });
});

describe("importBase64urlPublicKey", () => {
  it("imports a base64url-encoded Ed25519 public key", () => {
    const original = makeTestKeyPair();
    const base64url = exportBase64url(original);
    const imported = importBase64urlPublicKey(base64url);

    // Compare DER exports
    const originalDer = original.export({ type: "spki", format: "der" });
    const importedDer = imported.export({ type: "spki", format: "der" });
    expect(Buffer.compare(originalDer as Buffer, importedDer as Buffer)).toBe(0);
  });
});
