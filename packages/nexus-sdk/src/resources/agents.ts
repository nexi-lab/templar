/**
 * Agents resource for managing AI agents
 */

import type {
  Agent,
  AgentsResponse,
  CreateAgentParams,
  ListAgentsParams,
  UpdateAgentParams,
} from "../types/agents.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing agents
 */
export class AgentsResource extends BaseResource {
  /**
   * Create a new agent
   *
   * @param params - Agent creation parameters
   * @returns The created agent
   *
   * @example
   * ```typescript
   * const agent = await client.agents.create({
   *   name: 'my-agent',
   *   model: {
   *     provider: 'openai',
   *     name: 'gpt-4',
   *   },
   * });
   * ```
   */
  async create(params: CreateAgentParams): Promise<Agent> {
    return this.http.request<Agent>("/agents", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get an agent by ID
   *
   * @param id - Agent ID
   * @returns The agent
   *
   * @example
   * ```typescript
   * const agent = await client.agents.get('agent-123');
   * ```
   */
  async get(id: string): Promise<Agent> {
    return this.http.request<Agent>(`/agents/${id}`, {
      method: "GET",
    });
  }

  /**
   * Update an agent
   *
   * @param id - Agent ID
   * @param params - Agent update parameters
   * @returns The updated agent
   *
   * @example
   * ```typescript
   * const agent = await client.agents.update('agent-123', {
   *   status: 'inactive',
   * });
   * ```
   */
  async update(id: string, params: UpdateAgentParams): Promise<Agent> {
    return this.http.request<Agent>(`/agents/${id}`, {
      method: "PATCH",
      body: params,
    });
  }

  /**
   * Delete an agent
   *
   * @param id - Agent ID
   *
   * @example
   * ```typescript
   * await client.agents.delete('agent-123');
   * ```
   */
  async delete(id: string): Promise<void> {
    return this.http.request<void>(`/agents/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * List agents with optional filtering and pagination
   *
   * @param params - List parameters
   * @returns Paginated list of agents
   *
   * @example
   * ```typescript
   * const response = await client.agents.list({
   *   status: 'active',
   *   limit: 50,
   * });
   * console.log(response.data); // Array of agents
   * console.log(response.hasMore); // Whether there are more results
   * ```
   */
  async list(params?: ListAgentsParams): Promise<AgentsResponse> {
    return this.http.request<AgentsResponse>("/agents", {
      method: "GET",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }
}
