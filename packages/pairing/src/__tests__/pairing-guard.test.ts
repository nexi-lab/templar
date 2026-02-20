import { describe, expect, it } from "vitest";
import type { NexusPairingClient } from "../nexus-client.js";
import { PairingGuard } from "../pairing-guard.js";
import type { PairedPeer } from "../types.js";

/** Create a guard with fixed clock and whatsapp as pairing channel */
function createGuard(overrides: Record<string, unknown> = {}, startTime: number = 1000000) {
  let now = startTime;
  const guard = new PairingGuard(
    {
      enabled: true,
      codeLength: 8,
      expiryMs: 300_000,
      maxAttempts: 3,
      maxPendingCodes: 1000,
      channels: ["whatsapp"],
      ...overrides,
    },
    { now: () => now },
  );
  const advanceTime = (ms: number) => {
    now += ms;
  };
  const setTime = (t: number) => {
    now = t;
  };
  return { guard, advanceTime, setTime, getTime: () => now };
}

// ---------------------------------------------------------------------------
// Validation group
// ---------------------------------------------------------------------------

describe("PairingGuard — validation", () => {
  it("approved peer returns 'approved' (O(1) lookup)", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    // Pair the peer
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("paired");
    // Now check again — should be approved
    const check = guard.checkSender("agent-1", "whatsapp", "peer-1", "hello");
    expect(check.status).toBe("approved");
  });

  it("valid code in message returns 'paired'", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.formatted);
    expect(result.status).toBe("paired");
    if (result.status === "paired") {
      expect(result.peer.peerId).toBe("peer-1");
      expect(result.peer.channel).toBe("whatsapp");
    }
  });

  it("wrong code returns 'invalid_code'", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    expect(result.status).toBe("invalid_code");
  });

  it("expired code returns 'expired_code'", () => {
    const { guard, advanceTime } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    advanceTime(300_001); // Just past 5min
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("expired_code");
  });

  it("no code in message returns 'pending' with instruction", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "Hello!");
    expect(result.status).toBe("pending");
    if (result.status === "pending") {
      expect(result.message).toContain("pairing code");
    }
  });

  it("code consumed after use (second use fails)", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const first = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(first.status).toBe("paired");
    // Second peer tries same code
    const second = guard.checkSender("agent-1", "whatsapp", "peer-2", code.code);
    expect(second.status).toBe("invalid_code");
  });

  it("case-insensitive code matching", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const lower = code.formatted.toLowerCase();
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", lower);
    expect(result.status).toBe("paired");
  });

  it("dash-optional matching", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    // Send raw code without dash
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("paired");
  });

  it("code embedded in text is extracted", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender(
      "agent-1",
      "whatsapp",
      "peer-1",
      `Hi there ${code.formatted} please pair me`,
    );
    expect(result.status).toBe("paired");
  });

  it("already-paired peer sending code again returns 'approved'", () => {
    const { guard } = createGuard();
    const code1 = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code1.code);
    // Peer sends another code
    const code2 = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code2.code);
    expect(result.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Rate limiting group
// ---------------------------------------------------------------------------

describe("PairingGuard — rate limiting", () => {
  it("1st-3rd invalid attempts pass (return invalid_code)", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    for (let i = 0; i < 3; i++) {
      const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
      expect(result.status).toBe("invalid_code");
    }
  });

  it("4th attempt returns rate_limited", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    for (let i = 0; i < 3; i++) {
      guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    }
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    expect(result.status).toBe("rate_limited");
  });

  it("window resets after expiry", () => {
    const { guard, advanceTime } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    for (let i = 0; i < 3; i++) {
      guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    }
    expect(guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ").status).toBe(
      "rate_limited",
    );

    advanceTime(300_001); // Past expiry window
    // Regenerate code since original expired
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "YYYY-YYYY");
    expect(result.status).toBe("invalid_code"); // Not rate_limited
  });

  it("different peers tracked independently", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    // Peer-1 uses up attempts
    for (let i = 0; i < 3; i++) {
      guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    }
    expect(guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ").status).toBe(
      "rate_limited",
    );
    // Peer-2 is not rate limited
    const result = guard.checkSender("agent-1", "whatsapp", "peer-2", "ZZZZ-ZZZZ");
    expect(result.status).toBe("invalid_code");
  });

  it("valid code on attempt 3 succeeds", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    // 2 bad attempts
    guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    guard.checkSender("agent-1", "whatsapp", "peer-1", "YYYY-YYYY");
    // 3rd attempt with valid code
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("paired");
  });

  it("rate limit + then valid code on attempt 4 fails (rate limit wins)", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    // Use up all 3 attempts
    for (let i = 0; i < 3; i++) {
      guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    }
    // 4th attempt with valid code — rate limited
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(result.status).toBe("rate_limited");
  });
});

// ---------------------------------------------------------------------------
// Peer management group
// ---------------------------------------------------------------------------

describe("PairingGuard — peer management", () => {
  it("generateCode creates pending code", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    expect(code.code).toHaveLength(8);
    expect(code.formatted).toContain("-");
    expect(code.agentId).toBe("agent-1");
    expect(code.channel).toBe("whatsapp");
    expect(guard.getStats().pendingCodeCount).toBe(1);
  });

  it("listPeers returns all peers", () => {
    const { guard } = createGuard();
    const code1 = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code1.code);
    const code2 = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-2", code2.code);

    const peers = guard.listPeers();
    expect(peers).toHaveLength(2);
  });

  it("listPeers filters by channel", () => {
    const { guard } = createGuard({ channels: ["whatsapp", "telegram"] });
    const c1 = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", c1.code);
    const c2 = guard.generateCode("agent-1", "telegram");
    guard.checkSender("agent-1", "telegram", "peer-2", c2.code);

    expect(guard.listPeers(undefined, "whatsapp")).toHaveLength(1);
    expect(guard.listPeers(undefined, "telegram")).toHaveLength(1);
  });

  it("revokePeer removes peer from approved map", async () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    expect(guard.listPeers()).toHaveLength(1);

    const removed = await guard.revokePeer("agent-1", "whatsapp", "peer-1");
    expect(removed).toBe(true);
    expect(guard.listPeers()).toHaveLength(0);

    // After revocation, peer is no longer approved
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "hello");
    expect(result.status).toBe("pending");
  });

  it("revokePeer returns false for unknown peer", async () => {
    const { guard } = createGuard();
    const removed = await guard.revokePeer("agent-1", "whatsapp", "unknown");
    expect(removed).toBe(false);
  });

  it("revokePeer calls nexusClient.removePeer when provided", async () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);

    let removeCalled = false;
    const mockClient: NexusPairingClient = {
      addPeer: async () => ({ agentId: "", channel: "", peerId: "", pairedAt: 0 }),
      listPeers: async () => ({ peers: [], hasMore: false }),
      removePeer: async () => {
        removeCalled = true;
        return true;
      },
    };

    await guard.revokePeer("agent-1", "whatsapp", "peer-1", mockClient);
    expect(removeCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle group
// ---------------------------------------------------------------------------

describe("PairingGuard — lifecycle", () => {
  it("sweep removes expired codes", () => {
    const { guard, advanceTime } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    guard.generateCode("agent-1", "whatsapp");
    expect(guard.getStats().pendingCodeCount).toBe(2);

    advanceTime(300_001);
    guard.sweep();
    expect(guard.getStats().pendingCodeCount).toBe(0);
  });

  it("sweep removes expired rate limit records", () => {
    const { guard, advanceTime } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", "ZZZZ-ZZZZ");
    expect(guard.getStats().rateLimitedPeerCount).toBe(1);

    advanceTime(300_001);
    guard.sweep();
    expect(guard.getStats().rateLimitedPeerCount).toBe(0);
  });

  it("LRU eviction when maxPendingCodes reached", () => {
    const { guard } = createGuard({ maxPendingCodes: 3 });
    const code1 = guard.generateCode("agent-1", "whatsapp");
    guard.generateCode("agent-1", "whatsapp");
    guard.generateCode("agent-1", "whatsapp");
    expect(guard.getStats().pendingCodeCount).toBe(3);

    // Adding a 4th should evict the oldest (code1)
    guard.generateCode("agent-1", "whatsapp");
    expect(guard.getStats().pendingCodeCount).toBe(3);

    // First code should be evicted
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", code1.code);
    expect(result.status).toBe("invalid_code");
  });

  it("getStats returns accurate counts", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);
    guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-2", "ZZZZ-ZZZZ");

    const stats = guard.getStats();
    expect(stats.approvedPeerCount).toBe(1);
    expect(stats.pendingCodeCount).toBe(1); // code was consumed
    expect(stats.rateLimitedPeerCount).toBe(1);
  });

  it("loadApprovedPeers loads from NexusPairingClient", async () => {
    const { guard } = createGuard();

    const mockPeers: PairedPeer[] = [
      { agentId: "agent-1", channel: "whatsapp", peerId: "peer-1", pairedAt: 100 },
      { agentId: "agent-1", channel: "whatsapp", peerId: "peer-2", pairedAt: 200 },
    ];

    const mockClient: NexusPairingClient = {
      addPeer: async () => mockPeers[0] as PairedPeer,
      listPeers: async (params) => {
        if (!params.cursor) {
          return { peers: mockPeers, hasMore: false };
        }
        return { peers: [], hasMore: false };
      },
      removePeer: async () => true,
    };

    const count = await guard.loadApprovedPeers("agent-1", mockClient);
    expect(count).toBe(2);
    expect(guard.getStats().approvedPeerCount).toBe(2);

    // Loaded peers should be approved
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "hello");
    expect(result.status).toBe("approved");
  });
});
