/**
 * Zones resource for zone management and federation.
 */

import type {
  CreateZoneParams,
  DeprovisionZoneResponse,
  JoinZoneParams,
  JoinZoneResponse,
  ListZonesParams,
  ShareZoneParams,
  ShareZoneResponse,
  Zone,
  ZonesResponse,
} from "../types/zones.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing zones.
 */
export class ZonesResource extends BaseResource {
  /**
   * Create a new zone.
   *
   * @param params - Zone creation parameters
   * @returns The created zone
   */
  async create(params: CreateZoneParams): Promise<Zone> {
    return this.http.request<Zone>("/zones", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get a zone by ID.
   *
   * @param zoneId - Zone identifier
   * @returns The zone
   */
  async get(zoneId: string): Promise<Zone> {
    return this.http.request<Zone>(`/zones/${zoneId}`, {
      method: "GET",
    });
  }

  /**
   * List zones with optional pagination.
   *
   * @param params - List parameters
   * @returns Paginated list of zones
   */
  async list(params?: ListZonesParams): Promise<ZonesResponse> {
    return this.http.request<ZonesResponse>("/zones", {
      method: "GET",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Deprovision a zone (202 Accepted, finalizer protocol).
   *
   * @param zoneId - Zone identifier
   * @returns Deprovision response with finalizer status
   */
  async deprovision(zoneId: string): Promise<DeprovisionZoneResponse> {
    return this.http.request<DeprovisionZoneResponse>(`/zones/${zoneId}`, {
      method: "DELETE",
    });
  }

  /**
   * Share a zone subtree with a peer (push model).
   *
   * @param zoneId - Zone identifier
   * @param params - Share parameters
   * @returns Share response
   */
  async share(zoneId: string, params: ShareZoneParams): Promise<ShareZoneResponse> {
    return this.http.request<ShareZoneResponse>(`/zones/${zoneId}/share`, {
      method: "POST",
      body: params,
    });
  }

  /**
   * Join a peer's shared zone (pull model).
   *
   * @param zoneId - Zone identifier
   * @param params - Join parameters
   * @returns Join response
   */
  async join(zoneId: string, params: JoinZoneParams): Promise<JoinZoneResponse> {
    return this.http.request<JoinZoneResponse>(`/zones/${zoneId}/join`, {
      method: "POST",
      body: params,
    });
  }
}
