/**
 * Zone management types for Nexus federation API.
 *
 * Types match the Nexus REST wire format (snake_case).
 */

export type ZonePhase = "Active" | "Terminating" | "Terminated";

export interface Zone {
  zone_id: string;
  name: string;
  domain: string | null;
  description: string | null;
  phase: ZonePhase;
  finalizers: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateZoneParams {
  zone_id?: string;
  name: string;
  domain?: string;
  description?: string;
}

export interface ListZonesParams {
  limit?: number;
  offset?: number;
}

export interface ZonesResponse {
  zones: Zone[];
  total: number;
}

export interface DeprovisionZoneResponse {
  zone_id: string;
  phase: string;
  finalizers_completed: string[];
  finalizers_pending: string[];
  finalizers_failed: Record<string, string>;
}

export interface ShareZoneParams {
  local_path: string;
  peer_addr: string;
  remote_path: string;
}

export interface JoinZoneParams {
  peer_addr: string;
  remote_path: string;
  local_path: string;
}

export interface ShareZoneResponse {
  zone_id: string;
}

export interface JoinZoneResponse {
  zone_id: string;
}
