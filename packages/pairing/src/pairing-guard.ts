/**
 * PairingGuard — Gateway-level DM access control via pairing codes (#89)
 *
 * Owner-initiated flow: owner generates code → shares out-of-band → user sends
 * code to bot → access granted. Avoids OAuth for messaging channels.
 *
 * Design:
 * - O(1) dual-Map lookup for checkSender() hot path
 * - Immutable state (reassigned, never mutated)
 * - Configurable caps + LRU eviction for pending codes
 * - Per-peer sliding window rate limiting
 */

import { extractPairingCode, generatePairingCode, normalizePairingCode } from "./code-generator.js";
import type { NexusPairingClient } from "./nexus-client.js";
import type {
  PairedPeer,
  PairingCheckResult,
  PairingConfig,
  PairingGuardDeps,
  PairingStats,
  PendingCode,
  RateLimitEntry,
} from "./types.js";
import { DEFAULT_PAIRING_CONFIG, validatePairingConfig } from "./types.js";

// ---------------------------------------------------------------------------
// PairingGuard
// ---------------------------------------------------------------------------

export class PairingGuard {
  private readonly config: PairingConfig;
  private readonly now: () => number;

  // Immutable state — reassigned as new maps, never mutated in-place
  private approvedPeers: ReadonlyMap<string, PairedPeer>;
  private pendingCodes: ReadonlyMap<string, PendingCode>;
  private rateLimits: ReadonlyMap<string, RateLimitEntry>;

  // Track insertion order for LRU eviction of pending codes
  private pendingCodeOrder: readonly string[];

  // Channel lookup set for O(1) channel check
  private channelSet: ReadonlySet<string>;

  constructor(config?: Partial<PairingConfig>, deps?: PairingGuardDeps) {
    const merged: PairingConfig = { ...DEFAULT_PAIRING_CONFIG, ...config };
    validatePairingConfig(merged);
    this.config = merged;
    this.now = deps?.now ?? (() => Date.now());

    this.approvedPeers = new Map();
    this.pendingCodes = new Map();
    this.rateLimits = new Map();
    this.pendingCodeOrder = [];
    this.channelSet = new Set(merged.channels);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generate a pairing code for a channel. Owner-initiated.
   * If maxPendingCodes is reached, the oldest code is evicted (LRU).
   */
  generateCode(agentId: string, channel: string): PendingCode {
    const { code, formatted } = generatePairingCode(this.config.codeLength);
    const now = this.now();

    const pendingCode: PendingCode = {
      code,
      formatted,
      agentId,
      channel,
      createdAt: now,
      expiresAt: now + this.config.expiryMs,
    };

    const normalized = normalizePairingCode(code);

    // LRU eviction if at capacity
    const newCodes = new Map(this.pendingCodes);
    let newOrder = [...this.pendingCodeOrder];

    if (newCodes.size >= this.config.maxPendingCodes) {
      const oldest = newOrder[0];
      if (oldest !== undefined) {
        newCodes.delete(oldest);
        newOrder = newOrder.slice(1);
      }
    }

    newCodes.set(normalized, pendingCode);
    newOrder.push(normalized);

    this.pendingCodes = newCodes;
    this.pendingCodeOrder = newOrder;

    return pendingCode;
  }

  /**
   * Check if a sender is authorized for DM access. Called on every DM.
   *
   * O(1) hot path for approved peers. Full flow:
   * 1. Non-pairing channel → "bypass"
   * 2. Already approved → "approved"
   * 3. Rate limited → "rate_limited"
   * 4. Extract code from message
   * 5. No code → "pending"
   * 6. Invalid/expired code → "invalid_code"/"expired_code" (increments rate counter)
   * 7. Valid code → "paired" (adds to approved, consumes code)
   */
  checkSender(
    agentId: string,
    channel: string,
    peerId: string,
    messageText?: string,
  ): PairingCheckResult {
    // 0. Guard disabled → bypass everything
    if (!this.config.enabled) {
      return { status: "bypass" };
    }

    // 1. Channel not in pairing list → bypass
    if (!this.channelSet.has(channel)) {
      return { status: "bypass" };
    }

    // 2. Already approved → O(1) lookup
    const peerKey = `${channel}:${peerId}`;
    if (this.approvedPeers.has(peerKey)) {
      return { status: "approved" };
    }

    // 3. Rate limit check
    if (this.isRateLimited(peerKey)) {
      return { status: "rate_limited" };
    }

    // 4. Extract code from message
    const extractedCode = messageText ? extractPairingCode(messageText) : undefined;

    // 5. No code found → prompt for code
    if (!extractedCode) {
      return {
        status: "pending",
        message: "Please send your pairing code to access this channel.",
      };
    }

    // 6. Look up code in pending codes
    const pending = this.pendingCodes.get(extractedCode);

    if (!pending) {
      this.incrementRateLimit(peerKey);
      return { status: "invalid_code" };
    }

    // 7. Check expiry
    if (this.now() > pending.expiresAt) {
      this.incrementRateLimit(peerKey);
      return { status: "expired_code" };
    }

    // 8. Valid code — pair the peer
    const peer: PairedPeer = {
      agentId,
      channel,
      peerId,
      pairedAt: this.now(),
    };

    // Add to approved peers
    const newApproved = new Map(this.approvedPeers);
    newApproved.set(peerKey, peer);
    this.approvedPeers = newApproved;

    // Consume the code (remove from pending)
    const newCodes = new Map(this.pendingCodes);
    newCodes.delete(extractedCode);
    this.pendingCodes = newCodes;
    this.pendingCodeOrder = this.pendingCodeOrder.filter((k) => k !== extractedCode);

    // Clear rate limit for this peer
    if (this.rateLimits.has(peerKey)) {
      const newLimits = new Map(this.rateLimits);
      newLimits.delete(peerKey);
      this.rateLimits = newLimits;
    }

    return { status: "paired", peer };
  }

  /**
   * Load approved peers from Nexus on startup. Paginated with graceful degradation.
   * Returns the number of peers loaded.
   */
  async loadApprovedPeers(agentId: string, nexusClient: NexusPairingClient): Promise<number> {
    const newApproved = new Map(this.approvedPeers);
    let cursor: string | undefined;
    let totalLoaded = 0;

    do {
      const params = cursor ? { agentId, cursor, limit: 100 } : { agentId, limit: 100 };
      const page = await nexusClient.listPeers(params);

      for (const peer of page.peers) {
        const key = `${peer.channel}:${peer.peerId}`;
        newApproved.set(key, peer);
        totalLoaded++;
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    this.approvedPeers = newApproved;
    return totalLoaded;
  }

  /**
   * List all approved peers, optionally filtered by agent and/or channel.
   */
  listPeers(agentId?: string, channel?: string): readonly PairedPeer[] {
    const peers: PairedPeer[] = [];
    for (const peer of this.approvedPeers.values()) {
      if (agentId !== undefined && peer.agentId !== agentId) continue;
      if (channel !== undefined && peer.channel !== channel) continue;
      peers.push(peer);
    }
    return peers;
  }

  /**
   * Revoke a peer's access. Returns true if peer was found and removed.
   * Optionally persists the removal to Nexus.
   */
  async revokePeer(
    agentId: string,
    channel: string,
    peerId: string,
    nexusClient?: NexusPairingClient,
  ): Promise<boolean> {
    const key = `${channel}:${peerId}`;
    if (!this.approvedPeers.has(key)) return false;

    const newApproved = new Map(this.approvedPeers);
    newApproved.delete(key);
    this.approvedPeers = newApproved;

    if (nexusClient) {
      await nexusClient.removePeer({ agentId, channel, peerId });
    }

    return true;
  }

  /**
   * Sweep expired codes and rate limit records.
   * Called by gateway health monitor on its 30s cycle.
   */
  sweep(): void {
    const now = this.now();

    // Sweep expired pending codes
    const expiredKeys: string[] = [];
    for (const [key, code] of this.pendingCodes) {
      if (now > code.expiresAt) {
        expiredKeys.push(key);
      }
    }
    if (expiredKeys.length > 0) {
      const newCodes = new Map(this.pendingCodes);
      const expiredSet = new Set(expiredKeys);
      for (const key of expiredKeys) {
        newCodes.delete(key);
      }
      this.pendingCodes = newCodes;
      this.pendingCodeOrder = this.pendingCodeOrder.filter((k) => !expiredSet.has(k));
    }

    // Sweep expired rate limit windows
    const expiredLimits: string[] = [];
    for (const [key, entry] of this.rateLimits) {
      if (entry.windowStart + this.config.expiryMs < now) {
        expiredLimits.push(key);
      }
    }
    if (expiredLimits.length > 0) {
      const newLimits = new Map(this.rateLimits);
      for (const key of expiredLimits) {
        newLimits.delete(key);
      }
      this.rateLimits = newLimits;
    }
  }

  /** Get stats for monitoring. */
  getStats(): PairingStats {
    return {
      approvedPeerCount: this.approvedPeers.size,
      pendingCodeCount: this.pendingCodes.size,
      rateLimitedPeerCount: this.rateLimits.size,
    };
  }

  /**
   * Update config at runtime (hot-reload support).
   * Rebuilds the channel set.
   */
  updateConfig(config: Partial<PairingConfig>): void {
    const merged: PairingConfig = { ...this.config, ...config };
    validatePairingConfig(merged);
    // Use Object.assign to update readonly config (internal mutation for hot-reload)
    Object.assign(this.config, merged);
    this.channelSet = new Set(merged.channels);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private isRateLimited(peerKey: string): boolean {
    const entry = this.rateLimits.get(peerKey);
    if (!entry) return false;

    const now = this.now();
    // Window expired — not rate limited
    if (entry.windowStart + this.config.expiryMs < now) return false;

    return entry.attempts >= this.config.maxAttempts;
  }

  private incrementRateLimit(peerKey: string): void {
    const now = this.now();
    const existing = this.rateLimits.get(peerKey);

    const newLimits = new Map(this.rateLimits);

    if (existing && existing.windowStart + this.config.expiryMs >= now) {
      // Within window — increment
      newLimits.set(peerKey, {
        attempts: existing.attempts + 1,
        windowStart: existing.windowStart,
      });
    } else {
      // New window
      newLimits.set(peerKey, { attempts: 1, windowStart: now });
    }

    this.rateLimits = newLimits;
  }
}
