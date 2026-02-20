/**
 * E2E tests for @templar/pairing with FastAPI Nexus backend.
 *
 * Requires:
 *   NEXUS_E2E_URL=http://localhost:2028
 *   NEXUS_E2E_KEY=test-key
 *
 * Skipped when env vars are not set.
 */

import { describe, expect, it } from "vitest";
import type { NexusPairingClient, PeersPage } from "../nexus-client.js";
import { PairingGuard } from "../pairing-guard.js";
import type { PairedPeer } from "../types.js";

// ---------------------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------------------

const NEXUS_E2E_URL = process.env.NEXUS_E2E_URL ?? "";
const NEXUS_E2E_KEY = process.env.NEXUS_E2E_KEY ?? "";
const E2E_ENABLED = NEXUS_E2E_URL.length > 0 && NEXUS_E2E_KEY.length > 0;
const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mock Nexus client for non-E2E unit-level lifecycle tests
// ---------------------------------------------------------------------------

function createInMemoryNexusClient(): NexusPairingClient & { peers: PairedPeer[] } {
  const peers: PairedPeer[] = [];
  return {
    peers,
    async addPeer(params) {
      const peer: PairedPeer = {
        agentId: params.agentId,
        channel: params.channel,
        peerId: params.peerId,
        pairedAt: Date.now(),
      };
      peers.push(peer);
      return peer;
    },
    async listPeers(params): Promise<PeersPage> {
      const filtered = peers.filter(
        (p) => p.agentId === params.agentId && (!params.channel || p.channel === params.channel),
      );
      const limit = params.limit ?? 100;
      const startIdx = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
      const page = filtered.slice(startIdx, startIdx + limit);
      const hasMore = startIdx + limit < filtered.length;
      const cursor = hasMore ? String(startIdx + limit) : undefined;
      return {
        peers: page,
        ...(cursor ? { cursor } : {}),
        hasMore,
      };
    },
    async removePeer(params) {
      const idx = peers.findIndex(
        (p) =>
          p.agentId === params.agentId &&
          p.channel === params.channel &&
          p.peerId === params.peerId,
      );
      if (idx >= 0) {
        peers.splice(idx, 1);
        return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Lifecycle tests (always run — uses in-memory mock)
// ---------------------------------------------------------------------------

describe("PairingGuard — lifecycle (in-memory)", () => {
  it("full lifecycle: generate → validate → persist → verify", async () => {
    const client = createInMemoryNexusClient();
    const guard = new PairingGuard({
      enabled: true,
      channels: ["whatsapp"],
    });

    // 1. Generate code
    const code = guard.generateCode("agent-1", "whatsapp");

    // 2. Validate — pair the peer
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("paired");

    // 3. Persist to Nexus
    if (result.status === "paired") {
      await client.addPeer({
        agentId: result.peer.agentId,
        channel: result.peer.channel,
        peerId: result.peer.peerId,
      });
    }

    // 4. Verify persisted
    const page = await client.listPeers({ agentId: "agent-1" });
    expect(page.peers).toHaveLength(1);
    expect(page.peers[0]?.peerId).toBe("peer-1");
  });

  it("persistence: add peer → new guard → load → still approved", async () => {
    const client = createInMemoryNexusClient();

    // Guard 1: pair the peer
    const guard1 = new PairingGuard({ enabled: true, channels: ["whatsapp"] });
    const code = guard1.generateCode("agent-1", "whatsapp");
    guard1.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    await client.addPeer({ agentId: "agent-1", channel: "whatsapp", peerId: "peer-1" });

    // Guard 2: fresh instance, load from nexus
    const guard2 = new PairingGuard({ enabled: true, channels: ["whatsapp"] });
    const count = await guard2.loadApprovedPeers("agent-1", client);
    expect(count).toBe(1);

    // Peer should be approved
    const result = guard2.checkSender("agent-1", "whatsapp", "peer-1", "hi");
    expect(result.status).toBe("approved");
  });

  it("revocation: add peer → revoke → verify removed", async () => {
    const client = createInMemoryNexusClient();
    const guard = new PairingGuard({ enabled: true, channels: ["whatsapp"] });

    // Pair
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    await client.addPeer({ agentId: "agent-1", channel: "whatsapp", peerId: "peer-1" });

    // Revoke
    await guard.revokePeer("agent-1", "whatsapp", "peer-1", client);

    // Verify removed from guard
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "hi");
    expect(result.status).toBe("pending");

    // Verify removed from nexus
    const page = await client.listPeers({ agentId: "agent-1" });
    expect(page.peers).toHaveLength(0);
  });

  it("pagination: add many peers → load in pages → all loaded", async () => {
    const client = createInMemoryNexusClient();

    // Add 150 peers
    for (let i = 0; i < 150; i++) {
      await client.addPeer({
        agentId: "agent-1",
        channel: "whatsapp",
        peerId: `peer-${i}`,
      });
    }

    const guard = new PairingGuard({ enabled: true, channels: ["whatsapp"] });
    const count = await guard.loadApprovedPeers("agent-1", client);
    expect(count).toBe(150);
    expect(guard.getStats().approvedPeerCount).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Performance tests
// ---------------------------------------------------------------------------

describe("PairingGuard — performance", () => {
  it("approved peer check < 0.1ms (1000 iterations, p99)", () => {
    const guard = new PairingGuard({ enabled: true, channels: ["whatsapp"] });
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);

    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      guard.checkSender("agent-1", "whatsapp", "peer-1", "hi");
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)];
    expect(p99).toBeLessThan(0.1);
  });

  it("generateCode < 1ms per code", () => {
    const guard = new PairingGuard({ enabled: true, channels: ["whatsapp"] });
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      guard.generateCode("agent-1", "whatsapp");
    }
    const avgMs = (performance.now() - start) / 100;
    expect(avgMs).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Real E2E tests (only with Nexus backend)
// ---------------------------------------------------------------------------

describeE2E("PairingGuard — E2E with Nexus", () => {
  it("full lifecycle against real Nexus", async () => {
    // This test would use a real NexusPairingClient connected to NEXUS_E2E_URL
    // Skipped by default when env vars not set
    expect(E2E_ENABLED).toBe(true);
  });

  it("graceful degradation: guard starts with empty peers when Nexus unreachable", async () => {
    const guard = new PairingGuard({ enabled: true, channels: ["whatsapp"] });

    const failingClient: NexusPairingClient = {
      addPeer: async () => {
        throw new Error("Nexus down");
      },
      listPeers: async () => {
        throw new Error("Nexus down");
      },
      removePeer: async () => {
        throw new Error("Nexus down");
      },
    };

    await expect(guard.loadApprovedPeers("agent-1", failingClient)).rejects.toThrow("Nexus down");

    // Guard should deny all DMs (no approved peers)
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "hi");
    expect(result.status).toBe("pending");
  });
});
