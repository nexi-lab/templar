/**
 * @templar/pairing — Code-based DM channel access control (#89)
 *
 * Provides pairing codes for messaging channels (WhatsApp, Telegram, Signal)
 * that lack OAuth. Owner generates a code, shares it out-of-band, and the
 * user sends the code to the bot to gain DM access.
 */

export {
  extractPairingCode,
  generatePairingCode,
  normalizePairingCode,
} from "./code-generator.js";
export type { NexusPairingClient } from "./nexus-client.js";
export { PairingGuard } from "./pairing-guard.js";
export type {
  PairedPeer,
  PairingCheckResult,
  PairingConfig,
  PairingGuardDeps,
  PairingStats,
  PendingCode,
  RateLimitEntry,
} from "./types.js";
export { DEFAULT_PAIRING_CONFIG, validatePairingConfig } from "./types.js";

export const PACKAGE_NAME = "@templar/pairing";
