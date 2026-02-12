import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAuthState } from "../helpers/in-memory-auth.js";

// ---------------------------------------------------------------------------
// AuthStateProvider contract tests
// Verifiable against any implementation (InMemoryAuthState, FileAuthState, etc.)
// ---------------------------------------------------------------------------

describe("AuthStateProvider contract", () => {
  let provider: InMemoryAuthState;

  beforeEach(() => {
    provider = new InMemoryAuthState();
  });

  it("should return a valid BaileysAuthState from getState()", async () => {
    const state = await provider.getState();
    expect(state).toBeDefined();
    expect(state.creds).toBeDefined();
    expect(typeof state.keys.get).toBe("function");
    expect(typeof state.keys.set).toBe("function");
  });

  it("should persist credentials via saveCreds()", async () => {
    const creds = { noiseKey: "test-key", signedIdentityKey: "test-id" };
    await provider.saveCreds(creds);

    expect(provider.saveCreds).toHaveBeenCalledWith(creds);
  });

  it("should clear all state via clear()", async () => {
    await provider.saveCreds({ noiseKey: "key" });
    await provider.clear();

    expect(provider.wasCleared()).toBe(true);
  });

  it("should support key store get/set operations", async () => {
    const state = await provider.getState();

    // Set some keys
    await state.keys.set({
      "pre-key": {
        "key-1": { keyPair: "test-pair-1" },
        "key-2": { keyPair: "test-pair-2" },
      },
    });

    // Get them back
    const result = await state.keys.get("pre-key", ["key-1", "key-2", "key-3"]);
    expect(result["key-1"]).toEqual({ keyPair: "test-pair-1" });
    expect(result["key-2"]).toEqual({ keyPair: "test-pair-2" });
    expect(result["key-3"]).toBeUndefined();
  });

  it("should delete keys when set to null", async () => {
    const state = await provider.getState();

    await state.keys.set({
      "pre-key": {
        "key-1": { keyPair: "pair" },
      },
    });

    // Delete by setting to null
    await state.keys.set({
      "pre-key": {
        "key-1": null as unknown as Record<string, unknown>,
      },
    });

    const result = await state.keys.get("pre-key", ["key-1"]);
    expect(result["key-1"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// InMemoryAuthState-specific tests
// ---------------------------------------------------------------------------

describe("InMemoryAuthState", () => {
  it("should start with empty credentials", async () => {
    const provider = new InMemoryAuthState();
    const state = await provider.getState();
    expect(state.creds).toEqual({});
  });

  it("should track saveCreds calls via vi.fn()", async () => {
    const provider = new InMemoryAuthState();
    await provider.saveCreds({ key: "value" });
    await provider.saveCreds({ key: "updated" });

    expect(provider.saveCreds).toHaveBeenCalledTimes(2);
  });

  it("should track clear calls via vi.fn()", async () => {
    const provider = new InMemoryAuthState();
    await provider.clear();

    expect(provider.clear).toHaveBeenCalledTimes(1);
    expect(provider.wasCleared()).toBe(true);
  });
});
