/**
 * Core types for @templar/pairing — Code-based DM channel access control (#89)
 */

import { PairingConfigurationError } from "@templar/errors";

/** Configuration for the PairingGuard */
export interface PairingConfig {
  readonly enabled: boolean;
  /** Number of characters in pairing code (default: 8) */
  readonly codeLength: number;
  /** Code expiry in milliseconds (default: 300_000 = 5 min) */
  readonly expiryMs: number;
  /** Max failed attempts per peer per window (default: 3) */
  readonly maxAttempts: number;
  /** Max pending codes before LRU eviction (default: 1000) */
  readonly maxPendingCodes: number;
  /** Channels that require pairing (e.g., ["whatsapp", "telegram"]) */
  readonly channels: readonly string[];
}

/** A pending pairing code awaiting validation */
export interface PendingCode {
  /** Raw code (e.g., "A3K9X2M7") */
  readonly code: string;
  /** Formatted code with dash (e.g., "A3K9-X2M7") */
  readonly formatted: string;
  readonly agentId: string;
  readonly channel: string;
  /** Epoch ms when the code was created */
  readonly createdAt: number;
  /** Epoch ms when the code expires */
  readonly expiresAt: number;
}

/** An approved paired peer */
export interface PairedPeer {
  readonly agentId: string;
  readonly channel: string;
  readonly peerId: string;
  /** Epoch ms when the peer was paired */
  readonly pairedAt: number;
}

/** Result of checkSender() — discriminated union on `status` */
export type PairingCheckResult =
  | { readonly status: "approved" }
  | { readonly status: "paired"; readonly peer: PairedPeer }
  | { readonly status: "pending"; readonly message: string }
  | { readonly status: "invalid_code" }
  | { readonly status: "expired_code" }
  | { readonly status: "rate_limited" }
  | { readonly status: "bypass" };

/** Rate limit tracking entry for a peer */
export interface RateLimitEntry {
  readonly attempts: number;
  readonly windowStart: number;
}

/** Runtime statistics for monitoring */
export interface PairingStats {
  readonly approvedPeerCount: number;
  readonly pendingCodeCount: number;
  readonly rateLimitedPeerCount: number;
}

/** Dependencies injectable for testing */
export interface PairingGuardDeps {
  /** Clock for time-based operations (default: Date.now) */
  readonly now?: () => number;
}

export const DEFAULT_PAIRING_CONFIG: PairingConfig = {
  enabled: true,
  codeLength: 8,
  expiryMs: 300_000,
  maxAttempts: 3,
  maxPendingCodes: 1000,
  channels: [],
};

/** Validate a pairing config, throwing PairingConfigurationError on invalid values */
export function validatePairingConfig(config?: Partial<PairingConfig>): void {
  if (config === undefined) return;

  if (config.codeLength !== undefined && config.codeLength < 4) {
    throw new PairingConfigurationError(`codeLength must be >= 4, got ${config.codeLength}`);
  }
  if (config.expiryMs !== undefined && config.expiryMs <= 0) {
    throw new PairingConfigurationError(`expiryMs must be > 0, got ${config.expiryMs}`);
  }
  if (config.maxAttempts !== undefined && config.maxAttempts <= 0) {
    throw new PairingConfigurationError(`maxAttempts must be > 0, got ${config.maxAttempts}`);
  }
  if (config.maxPendingCodes !== undefined && config.maxPendingCodes <= 0) {
    throw new PairingConfigurationError(
      `maxPendingCodes must be > 0, got ${config.maxPendingCodes}`,
    );
  }
}
