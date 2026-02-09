/**
 * Channels resource for managing communication channels
 */

import type {
  Channel,
  ChannelsResponse,
  CreateChannelParams,
  ListChannelsParams,
  UpdateChannelParams,
} from "../types/channels.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing channels
 */
export class ChannelsResource extends BaseResource {
  /**
   * Create a new channel
   *
   * @param params - Channel creation parameters
   * @returns The created channel
   *
   * @example
   * ```typescript
   * const channel = await client.channels.create({
   *   name: 'my-slack-channel',
   *   type: 'slack',
   *   config: {
   *     token: 'xoxb-...',
   *     channelId: 'C123456',
   *   },
   * });
   * ```
   */
  async create(params: CreateChannelParams): Promise<Channel> {
    return this.http.request<Channel>("/channels", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get a channel by ID
   *
   * @param id - Channel ID
   * @returns The channel
   *
   * @example
   * ```typescript
   * const channel = await client.channels.get('channel-123');
   * ```
   */
  async get(id: string): Promise<Channel> {
    return this.http.request<Channel>(`/channels/${id}`, {
      method: "GET",
    });
  }

  /**
   * Update a channel
   *
   * @param id - Channel ID
   * @param params - Channel update parameters
   * @returns The updated channel
   *
   * @example
   * ```typescript
   * const channel = await client.channels.update('channel-123', {
   *   status: 'inactive',
   * });
   * ```
   */
  async update(id: string, params: UpdateChannelParams): Promise<Channel> {
    return this.http.request<Channel>(`/channels/${id}`, {
      method: "PATCH",
      body: params,
    });
  }

  /**
   * Delete a channel
   *
   * @param id - Channel ID
   *
   * @example
   * ```typescript
   * await client.channels.delete('channel-123');
   * ```
   */
  async delete(id: string): Promise<void> {
    return this.http.request<void>(`/channels/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * List channels with optional filtering and pagination
   *
   * @param params - List parameters
   * @returns Paginated list of channels
   *
   * @example
   * ```typescript
   * const response = await client.channels.list({
   *   type: 'slack',
   *   limit: 50,
   * });
   * console.log(response.data); // Array of channels
   * console.log(response.hasMore); // Whether there are more results
   * ```
   */
  async list(params?: ListChannelsParams): Promise<ChannelsResponse> {
    return this.http.request<ChannelsResponse>("/channels", {
      method: "GET",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }
}
