/**
 * Main Nexus SDK client
 */

import { HttpClient } from "./http/index.js";
import { AceResource } from "./resources/ace/index.js";
import { AgentsResource } from "./resources/agents.js";
import { ArtifactsResource } from "./resources/artifacts.js";
import { ChannelsResource } from "./resources/channels.js";
import { EventLogResource } from "./resources/eventlog.js";
import { MemoryResource } from "./resources/memory.js";
import { PayResource } from "./resources/pay.js";
import { PermissionsResource } from "./resources/permissions.js";
import { SandboxResource } from "./resources/sandbox.js";
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
 * // Store a memory
 * const memory = await client.memory.store({
 *   content: 'User prefers TypeScript',
 *   scope: 'agent',
 *   memory_type: 'preference',
 * });
 * ```
 */
export class NexusClient {
  /**
   * Original config for creating new instances
   */
  private readonly _config: ClientConfig;

  /**
   * HTTP client instance
   */
  private readonly _http: HttpClient;

  /**
   * Agents resource
   */
  public readonly agents: AgentsResource;

  /**
   * Artifacts resource (persistent tool and agent definitions)
   */
  public readonly artifacts: ArtifactsResource;

  /**
   * Tools resource
   */
  public readonly tools: ToolsResource;

  /**
   * Channels resource
   */
  public readonly channels: ChannelsResource;

  /**
   * Memory resource
   */
  public readonly memory: MemoryResource;

  /**
   * Pay resource (budget tracking and cost management)
   */
  public readonly pay: PayResource;

  /**
   * Event Log resource (immutable audit trail)
   */
  public readonly eventLog: EventLogResource;

  /**
   * Permissions resource (ReBAC permission checks and namespace visibility)
   */
  public readonly permissions: PermissionsResource;

  /**
   * Sandbox resource (code execution via Monty, Docker, E2B)
   */
  public readonly sandbox: SandboxResource;

  /**
   * ACE resource (Adaptive Context Engine — trajectories, playbooks, reflection, etc.)
   */
  public readonly ace: AceResource;

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
    this._config = config;
    this._http = new HttpClient(config);
    this.agents = new AgentsResource(this._http);
    this.artifacts = new ArtifactsResource(this._http);
    this.tools = new ToolsResource(this._http);
    this.channels = new ChannelsResource(this._http);
    this.memory = new MemoryResource(this._http);
    this.pay = new PayResource(this._http);
    this.eventLog = new EventLogResource(this._http);
    this.permissions = new PermissionsResource(this._http);
    this.sandbox = new SandboxResource(this._http);
    this.ace = new AceResource(this._http);
  }

  /**
   * Create a new client with updated retry options
   *
   * Returns a new instance — the original client is not modified.
   *
   * @param options - Retry options
   * @returns New client instance with updated retry settings
   *
   * @example
   * ```typescript
   * const client = new NexusClient({ apiKey: 'xxx' });
   * const resilientClient = client.withRetry({ maxAttempts: 5, initialDelay: 2000 });
   * // client is unchanged, resilientClient has new retry settings
   * ```
   */
  withRetry(options: RetryOptions): NexusClient {
    return new NexusClient({
      ...this._config,
      retry: { ...this._config.retry, ...options },
    });
  }

  /**
   * Create a new client with updated timeout
   *
   * Returns a new instance — the original client is not modified.
   *
   * @param ms - Timeout in milliseconds
   * @returns New client instance with updated timeout
   *
   * @example
   * ```typescript
   * const client = new NexusClient({ apiKey: 'xxx' });
   * const slowClient = client.withTimeout(60000);
   * // client is unchanged, slowClient has 60s timeout
   * ```
   */
  withTimeout(ms: number): NexusClient {
    return new NexusClient({
      ...this._config,
      timeout: ms,
    });
  }
}
