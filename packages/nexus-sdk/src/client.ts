/**
 * Main Nexus SDK client
 */

import { HttpClient } from "./http/index.js";
import { AgentsResource } from "./resources/agents.js";
import { ChannelsResource } from "./resources/channels.js";
import { ToolsResource } from "./resources/tools.js";
import type { ClientConfig, RetryOptions } from "./types/index.js";

/**
 * Nexus API client
 *
 * Provides access to all Nexus API resources with built-in retry,
 * timeout, and error handling.
 *
 * @example
 * ```typescript
 * const client = new NexusClient({
 *   apiKey: process.env.NEXUS_API_KEY,
 *   baseUrl: 'https://api.nexus.dev',
 * });
 *
 * // Create an agent
 * const agent = await client.agents.create({
 *   name: 'my-agent',
 *   model: { provider: 'openai', name: 'gpt-4' },
 * });
 *
 * // List tools
 * const tools = await client.tools.list({ limit: 10 });
 * ```
 */
export class NexusClient {
  /**
   * HTTP client instance
   */
  private _http: HttpClient;

  /**
   * Agents resource
   */
  public readonly agents: AgentsResource;

  /**
   * Tools resource
   */
  public readonly tools: ToolsResource;

  /**
   * Channels resource
   */
  public readonly channels: ChannelsResource;

  /**
   * Create a new Nexus client
   *
   * @param config - Client configuration
   *
   * @example
   * ```typescript
   * const client = new NexusClient({
   *   apiKey: process.env.NEXUS_API_KEY,
   * });
   * ```
   */
  constructor(config: ClientConfig) {
    this._http = new HttpClient(config);
    this.agents = new AgentsResource(this._http);
    this.tools = new ToolsResource(this._http);
    this.channels = new ChannelsResource(this._http);
  }

  /**
   * Create a new client with updated retry options
   *
   * Returns a new instance with the same configuration but different retry settings.
   *
   * @param options - Retry options
   * @returns New client instance with updated retry settings
   *
   * @example
   * ```typescript
   * const client = new NexusClient({ apiKey: 'xxx' })
   *   .withRetry({ maxAttempts: 5, initialDelay: 2000 });
   * ```
   */
  withRetry(options: RetryOptions): this {
    this._http = this._http.withRetry(options);
    // Recreate resources with updated HttpClient
    (this as { agents: AgentsResource }).agents = new AgentsResource(this._http);
    (this as { tools: ToolsResource }).tools = new ToolsResource(this._http);
    (this as { channels: ChannelsResource }).channels = new ChannelsResource(this._http);
    return this;
  }

  /**
   * Create a new client with updated timeout
   *
   * Returns a new instance with the same configuration but different timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns New client instance with updated timeout
   *
   * @example
   * ```typescript
   * const client = new NexusClient({ apiKey: 'xxx' })
   *   .withTimeout(60000); // 60 second timeout
   * ```
   */
  withTimeout(ms: number): this {
    this._http = this._http.withTimeout(ms);
    // Recreate resources with updated HttpClient
    (this as { agents: AgentsResource }).agents = new AgentsResource(this._http);
    (this as { tools: ToolsResource }).tools = new ToolsResource(this._http);
    (this as { channels: ChannelsResource }).channels = new ChannelsResource(this._http);
    return this;
  }
}
