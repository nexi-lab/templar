import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { TemplarGateway, type TemplarGatewayDeps } from "../gateway.js";
import type { GatewayConfig, GatewayFrame } from "../protocol/index.js";
import type { WsServerFactory } from "../server.js";
import { createMockWss, DEFAULT_CAPS, type MockWs, type MockWss, sendFrame } from "./helpers.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey };
}

function exportBase64url(key: KeyObject): string {
  const der = key.export({ type: "spki", format: "der" }) as Buffer;
  return der.subarray(12).toString("base64url");
}

async function signJwt(privateKey: KeyObject, nodeId: string, exp = "5m"): Promise<string> {
  return new SignJWT({ sub: nodeId })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

async function signExpiredJwt(privateKey: KeyObject, nodeId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: nodeId })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt(now - 600)
    .setExpirationTime(now - 300)
    .sign(privateKey);
}

function createAuthGateway(overrides: Partial<GatewayConfig> = {}): {
  gateway: TemplarGateway;
  wss: MockWss;
} {
  const wss = createMockWss();
  const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
  const config: GatewayConfig = {
    port: 0,
    nexusUrl: "https://api.nexus.test",
    nexusApiKey: "test-key",
    sessionTimeout: 60_000,
    suspendTimeout: 300_000,
    healthCheckInterval: 30_000,
    laneCapacity: 256,
    maxConnections: 1024,
    maxFramesPerSecond: 100,
    defaultConversationScope: "per-channel-peer",
    maxConversations: 100_000,
    conversationTtl: 86_400_000,
    authMode: "dual",
    deviceAuth: {
      allowTofu: true,
      maxDeviceKeys: 10_000,
      jwtMaxAge: "5m",
    },
    ...overrides,
  };
  const deps: TemplarGatewayDeps = {
    wsFactory: factory,
    configWatcherDeps: {
      watch: () => ({
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
  const gateway = new TemplarGateway(config, deps);
  return { gateway, wss };
}

function getLastSentFrame(ws: MockWs): GatewayFrame | undefined {
  const frames = ws.sentFrames();
  return frames[frames.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth integration", () => {
  // -------------------------------------------------------------------------
  // Legacy token auth
  // -------------------------------------------------------------------------

  describe("legacy token auth", () => {
    it("legacy node connects with bearer token in dual mode", async () => {
      const { gateway, wss } = createAuthGateway({ authMode: "dual" });
      await gateway.start();

      const ws = wss.connect();
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "legacy-node",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const ack = getLastSentFrame(ws);
      expect(ack?.kind).toBe("node.register.ack");

      await gateway.stop();
    });

    it("legacy node rejected in ed25519-only mode", async () => {
      const { gateway, wss } = createAuthGateway({ authMode: "ed25519" });
      await gateway.start();

      const ws = wss.connect();
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "legacy-node",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      const last = getLastSentFrame(ws);
      expect(last?.kind).toBe("error");
      if (last?.kind === "error") {
        expect(last.error.status).toBe(403);
        expect(last.error.detail).toContain("Legacy token auth is disabled");
      }

      await gateway.stop();
    });

    it("legacy node with wrong token rejected", async () => {
      const { gateway, wss } = createAuthGateway({ authMode: "dual" });
      await gateway.start();

      const ws = wss.connect();
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "legacy-node",
        capabilities: DEFAULT_CAPS,
        token: "wrong-key",
      });

      const last = getLastSentFrame(ws);
      expect(last?.kind).toBe("error");
      if (last?.kind === "error") {
        expect(last.error.status).toBe(401);
      }

      await gateway.stop();
    });

    it("logs deprecation warning for legacy tokens in dual mode", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { gateway, wss } = createAuthGateway({ authMode: "dual" });
      await gateway.start();

      const ws = wss.connect();
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "legacy-node",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DEPRECATION"));
      warnSpy.mockRestore();

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Ed25519 auth
  // -------------------------------------------------------------------------

  describe("Ed25519 auth", () => {
    it("Ed25519 node connects with valid JWT", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "dual",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      const ws = wss.connect();
      const jwt = await signJwt(privateKey, "ed25519-node");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "ed25519-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: exportBase64url(publicKey),
      });

      // Need to wait for async verification
      await new Promise((r) => setTimeout(r, 50));

      const ack = getLastSentFrame(ws);
      expect(ack?.kind).toBe("node.register.ack");

      await gateway.stop();
    });

    it("Ed25519 node with expired JWT is rejected", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "dual",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      const ws = wss.connect();
      const jwt = await signExpiredJwt(privateKey, "ed25519-node");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "ed25519-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));

      const last = getLastSentFrame(ws);
      expect(last?.kind).toBe("error");
      if (last?.kind === "error") {
        expect(last.error.status).toBe(401);
      }

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // TOFU
  // -------------------------------------------------------------------------

  describe("TOFU registration", () => {
    it("unknown key + TOFU enabled: accepts and stores key", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { gateway, wss } = createAuthGateway({
        authMode: "ed25519",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      const ws = wss.connect();
      const jwt = await signJwt(privateKey, "new-node");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "new-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));

      const ack = getLastSentFrame(ws);
      expect(ack?.kind).toBe("node.register.ack");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TOFU"));
      warnSpy.mockRestore();

      await gateway.stop();
    });

    it("unknown key + TOFU disabled: rejected", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "ed25519",
        deviceAuth: { allowTofu: false, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      const ws = wss.connect();
      const jwt = await signJwt(privateKey, "new-node");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "new-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));

      const last = getLastSentFrame(ws);
      expect(last?.kind).toBe("error");
      if (last?.kind === "error") {
        expect(last.error.status).toBe(403);
        expect(last.error.detail).toContain("TOFU");
      }

      await gateway.stop();
    });

    it("second connection with same key: accepted", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "ed25519",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      // First connection — TOFU accepts key
      const ws1 = wss.connect();
      const jwt1 = await signJwt(privateKey, "tofu-node");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "tofu-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt1,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(getLastSentFrame(ws1)?.kind).toBe("node.register.ack");

      // Deregister first node cleanly before reconnecting
      sendFrame(ws1, {
        kind: "node.deregister",
        nodeId: "tofu-node",
        reason: "reconnecting",
      });

      // Simulate disconnect/cleanup after deregister
      const closeHandlers = ws1.handlers.get("close") ?? [];
      for (const h of closeHandlers) h(1000, "");

      await new Promise((r) => setTimeout(r, 10));

      // Second connection — same key should be accepted
      const ws2 = wss.connect();
      const jwt2 = await signJwt(privateKey, "tofu-node");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "tofu-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt2,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(getLastSentFrame(ws2)?.kind).toBe("node.register.ack");

      await gateway.stop();
    });

    it("second connection with different key: rejected (key mismatch)", async () => {
      const pair1 = makeKeyPair();
      const pair2 = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "ed25519",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      // First connection — TOFU accepts key
      const ws1 = wss.connect();
      const jwt1 = await signJwt(pair1.privateKey, "tofu-node");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "tofu-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt1,
        publicKey: exportBase64url(pair1.publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(getLastSentFrame(ws1)?.kind).toBe("node.register.ack");

      // Simulate disconnect
      const closeHandlers = ws1.handlers.get("close") ?? [];
      for (const h of closeHandlers) h(1000, "");

      // Second connection — different key should be rejected
      const ws2 = wss.connect();
      const jwt2 = await signJwt(pair2.privateKey, "tofu-node");
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "tofu-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt2,
        publicKey: exportBase64url(pair2.publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));
      const last = getLastSentFrame(ws2);
      expect(last?.kind).toBe("error");
      if (last?.kind === "error") {
        expect(last.error.status).toBe(403);
        expect(last.error.detail).toContain("mismatch");
      }

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Dual mode coexistence
  // -------------------------------------------------------------------------

  describe("dual mode", () => {
    it("legacy and ed25519 nodes coexist in dual mode", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const { gateway, wss } = createAuthGateway({
        authMode: "dual",
        deviceAuth: { allowTofu: true, maxDeviceKeys: 100, jwtMaxAge: "5m" },
      });
      await gateway.start();

      // Ed25519 node
      const ws1 = wss.connect();
      const jwt = await signJwt(privateKey, "ed25519-node");
      sendFrame(ws1, {
        kind: "node.register",
        nodeId: "ed25519-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: exportBase64url(publicKey),
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(getLastSentFrame(ws1)?.kind).toBe("node.register.ack");

      // Legacy node
      const ws2 = wss.connect();
      sendFrame(ws2, {
        kind: "node.register",
        nodeId: "legacy-node",
        capabilities: DEFAULT_CAPS,
        token: "test-key",
      });

      expect(getLastSentFrame(ws2)?.kind).toBe("node.register.ack");
      expect(gateway.nodeCount).toBe(2);

      await gateway.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Pre-registered keys
  // -------------------------------------------------------------------------

  describe("pre-registered keys", () => {
    it("accepts node with pre-registered key (TOFU disabled)", async () => {
      const { privateKey, publicKey } = makeKeyPair();
      const b64url = exportBase64url(publicKey);
      const { gateway, wss } = createAuthGateway({
        authMode: "ed25519",
        deviceAuth: {
          allowTofu: false,
          maxDeviceKeys: 100,
          jwtMaxAge: "5m",
          knownKeys: [{ nodeId: "known-node", publicKey: b64url }],
        },
      });
      await gateway.start();

      const ws = wss.connect();
      const jwt = await signJwt(privateKey, "known-node");
      sendFrame(ws, {
        kind: "node.register",
        nodeId: "known-node",
        capabilities: DEFAULT_CAPS,
        signature: jwt,
        publicKey: b64url,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(getLastSentFrame(ws)?.kind).toBe("node.register.ack");

      await gateway.stop();
    });
  });
});
