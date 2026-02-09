/**
 * Types for channel resources
 */

import type { PaginatedResponse, PaginationParams } from "./index.js";

/**
 * Channel status
 */
export type ChannelStatus = "active" | "inactive" | "error";

/**
 * Channel type
 */
export type ChannelType = "slack" | "discord" | "teams" | "webhook" | "custom";

/**
 * Channel representation
 */
export interface Channel {
  /**
   * Unique channel identifier
   */
  id: string;

  /**
   * Channel name
   */
  name: string;

  /**
   * Channel type
   */
  type: ChannelType;

  /**
   * Channel status
   */
  status: ChannelStatus;

  /**
   * Channel description
   */
  description?: string;

  /**
   * Channel configuration (provider-specific)
   */
  config: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Last update timestamp
   */
  updatedAt: string;
}

/**
 * Parameters for creating a channel
 */
export interface CreateChannelParams {
  /**
   * Channel name
   */
  name: string;

  /**
   * Channel type
   */
  type: ChannelType;

  /**
   * Channel description
   */
  description?: string;

  /**
   * Channel configuration (provider-specific)
   */
  config: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for updating a channel
 */
export interface UpdateChannelParams {
  /**
   * Channel name
   */
  name?: string;

  /**
   * Channel status
   */
  status?: ChannelStatus;

  /**
   * Channel description
   */
  description?: string;

  /**
   * Channel configuration (provider-specific)
   */
  config?: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for listing channels
 */
export interface ListChannelsParams extends PaginationParams {
  /**
   * Filter by type
   */
  type?: ChannelType;

  /**
   * Filter by status
   */
  status?: ChannelStatus;

  /**
   * Search query for name or description
   */
  query?: string;
}

/**
 * Paginated channels response
 */
export type ChannelsResponse = PaginatedResponse<Channel>;
