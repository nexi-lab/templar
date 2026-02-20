/**
 * Narrow interface for Nexus pairing operations.
 *
 * Decouples PairingGuard from the full NexusClient — easily mocked in tests
 * and implemented by the @nexus/sdk PairingResource.
 */

import type { PairedPeer } from "./types.js";

export interface AddPeerParams {
  readonly agentId: string;
  readonly channel: string;
  readonly peerId: string;
}

export interface ListPeersParams {
  readonly agentId: string;
  readonly channel?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface RemovePeerParams {
  readonly agentId: string;
  readonly channel: string;
  readonly peerId: string;
}

export interface PeersPage {
  readonly peers: readonly PairedPeer[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

/** Minimal interface for Nexus pairing persistence */
export interface NexusPairingClient {
  addPeer(params: AddPeerParams): Promise<PairedPeer>;
  listPeers(params: ListPeersParams): Promise<PeersPage>;
  removePeer(params: RemovePeerParams): Promise<boolean>;
}
