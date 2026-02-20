/**
 * PairingResource — Nexus Pairing API (v2)
 *
 * Manages paired peer storage for DM channel access control.
 */

import type { AddPeerParams, ListPeersParams, PeerEntry, PeersPage, RemovePeerParams } from "../types/pairing.js";
import { BaseResource } from "./base.js";

export class PairingResource extends BaseResource {
  /**
   * Add a paired peer for an agent.
   */
  async addPeer(params: AddPeerParams): Promise<PeerEntry> {
    return this.http.request<PeerEntry>(`/api/v2/pairing/${params.agentId}/peers`, {
      method: "POST",
      body: { channel: params.channel, peer_id: params.peerId },
    });
  }

  /**
   * List paired peers for an agent, with optional channel filter and pagination.
   */
  async listPeers(params: ListPeersParams): Promise<PeersPage> {
    return this.http.request<PeersPage>(`/api/v2/pairing/${params.agentId}/peers`, {
      method: "GET",
      query: {
        channel: params.channel,
        cursor: params.cursor,
        limit: params.limit,
      },
    });
  }

  /**
   * Remove a paired peer.
   */
  async removePeer(params: RemovePeerParams): Promise<void> {
    await this.http.request<void>(
      `/api/v2/pairing/${params.agentId}/peers/${params.channel}/${params.peerId}`,
      { method: "DELETE" },
    );
  }
}
