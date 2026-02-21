/**
 * Zone client — wraps @nexus/sdk ZonesResource with camelCase types,
 * domain-specific errors, and pre-flight validation.
 *
 * Uses a single `toZoneInfo()` mapper (Decision #5) for snake_case → camelCase.
 * Performs a pre-check GET before share/join to verify zone phase (Decision #15).
 */

import type { NexusClient, Zone } from "@nexus/sdk";
import type { ZoneId, ZoneInfo, ZonePhase } from "@templar/core";
import {
  FederationZoneAlreadyExistsError,
  FederationZoneJoinFailedError,
  FederationZoneNotFoundError,
  FederationZoneShareFailedError,
  FederationZoneTerminatingError,
} from "@templar/errors";
import { validateZoneId } from "./validation.js";

// ---------------------------------------------------------------------------
// Local types (not in core — Decision #8)
// ---------------------------------------------------------------------------

export interface CreateZoneOptions {
  readonly name: string;
  readonly domain?: string;
  readonly description?: string;
  readonly zoneId?: ZoneId;
}

export interface ListZonesOptions {
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListZonesResult {
  readonly zones: readonly ZoneInfo[];
  readonly total: number;
}

export interface ShareZoneOptions {
  readonly localPath: string;
  readonly peerAddr: string;
  readonly remotePath: string;
}

export interface JoinZoneOptions {
  readonly peerAddr: string;
  readonly remotePath: string;
  readonly localPath: string;
}

// ---------------------------------------------------------------------------
// Mapper (Decision #5 — single toZoneInfo)
// ---------------------------------------------------------------------------

/** Map SDK snake_case Zone → camelCase ZoneInfo */
function toZoneInfo(zone: Zone): ZoneInfo {
  return {
    zoneId: zone.zone_id,
    name: zone.name,
    domain: zone.domain,
    description: zone.description,
    phase: zone.phase as ZonePhase,
    createdAt: zone.created_at,
    updatedAt: zone.updated_at,
  };
}

// ---------------------------------------------------------------------------
// ZoneClient
// ---------------------------------------------------------------------------

export class ZoneClient {
  private readonly _sdk: NexusClient;

  constructor(sdk: NexusClient) {
    this._sdk = sdk;
  }

  /** Create a new zone. */
  async create(options: CreateZoneOptions): Promise<ZoneInfo> {
    if (options.zoneId !== undefined) {
      validateZoneId(options.zoneId);
    }

    try {
      const zone = await this._sdk.zones.create({
        name: options.name,
        ...(options.zoneId !== undefined ? { zone_id: options.zoneId } : {}),
        ...(options.domain !== undefined ? { domain: options.domain } : {}),
        ...(options.description !== undefined ? { description: options.description } : {}),
      });
      return toZoneInfo(zone);
    } catch (error) {
      if (isNexusError(error, 409)) {
        throw new FederationZoneAlreadyExistsError(options.zoneId ?? options.name);
      }
      throw error;
    }
  }

  /** Get a zone by ID. */
  async get(zoneId: ZoneId): Promise<ZoneInfo> {
    validateZoneId(zoneId);

    try {
      const zone = await this._sdk.zones.get(zoneId);
      return toZoneInfo(zone);
    } catch (error) {
      if (isNexusError(error, 404)) {
        throw new FederationZoneNotFoundError(zoneId);
      }
      throw error;
    }
  }

  /** List zones with optional pagination. */
  async list(options?: ListZonesOptions): Promise<ListZonesResult> {
    const response = await this._sdk.zones.list(
      options
        ? {
            ...(options.limit !== undefined ? { limit: options.limit } : {}),
            ...(options.offset !== undefined ? { offset: options.offset } : {}),
          }
        : undefined,
    );
    return {
      zones: response.zones.map(toZoneInfo),
      total: response.total,
    };
  }

  /** Deprovision (terminate) a zone. */
  async deprovision(zoneId: ZoneId): Promise<void> {
    validateZoneId(zoneId);

    try {
      await this._sdk.zones.deprovision(zoneId);
    } catch (error) {
      if (isNexusError(error, 404)) {
        throw new FederationZoneNotFoundError(zoneId);
      }
      throw error;
    }
  }

  /**
   * Share a zone subtree with a peer.
   *
   * Pre-checks zone phase to prevent share on terminating zones (Decision #15).
   */
  async share(zoneId: ZoneId, options: ShareZoneOptions): Promise<void> {
    validateZoneId(zoneId);

    // Pre-check zone phase (Decision #15 — accept extra GET for safety)
    const zone = await this.get(zoneId);
    if (zone.phase !== "Active") {
      throw new FederationZoneTerminatingError(zoneId, zone.phase);
    }

    try {
      await this._sdk.zones.share(zoneId, {
        local_path: options.localPath,
        peer_addr: options.peerAddr,
        remote_path: options.remotePath,
      });
    } catch (error) {
      if (error instanceof FederationZoneTerminatingError) throw error;
      throw new FederationZoneShareFailedError(
        zoneId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Join a peer's shared zone.
   *
   * Pre-checks zone phase to prevent join on terminating zones (Decision #15).
   */
  async join(zoneId: ZoneId, options: JoinZoneOptions): Promise<void> {
    validateZoneId(zoneId);

    // Pre-check zone phase
    const zone = await this.get(zoneId);
    if (zone.phase !== "Active") {
      throw new FederationZoneTerminatingError(zoneId, zone.phase);
    }

    try {
      await this._sdk.zones.join(zoneId, {
        peer_addr: options.peerAddr,
        remote_path: options.remotePath,
        local_path: options.localPath,
      });
    } catch (error) {
      if (error instanceof FederationZoneTerminatingError) throw error;
      throw new FederationZoneJoinFailedError(
        zoneId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNexusError(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: number }).status === status
  );
}
