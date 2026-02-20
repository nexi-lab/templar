/**
 * Types for the Nexus Pairing API (v2)
 */

export interface AddPeerParams {
  readonly agentId: string;
  readonly channel: string;
  readonly peerId: string;
}

export interface ListPeersParams {
  readonly agentId: string;
  readonly channel?: string;
  readonly cursor?: string;
  /** Max peers per page (default: 100) */
  readonly limit?: number;
}

export interface RemovePeerParams {
  readonly agentId: string;
  readonly channel: string;
  readonly peerId: string;
}

export interface PeerEntry {
  readonly agent_id: string;
  readonly channel: string;
  readonly peer_id: string;
  /** ISO-8601 timestamp */
  readonly paired_at: string;
}

export interface PeersPage {
  readonly peers: readonly PeerEntry[];
  readonly cursor?: string;
  readonly has_more: boolean;
}
